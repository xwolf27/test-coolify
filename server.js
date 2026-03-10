const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const web3FormsAccessKey = process.env.WEB3FORMS_ACCESS_KEY || "";
const rootDir = __dirname;
const submissions = [];

const files = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/image5.webp": { file: "image5.webp", type: "image/webp" },
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function serveFile(response, pathname) {
  const asset = files[pathname];
  if (!asset) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const filePath = path.join(rootDir, asset.file);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, 500, { error: "Unable to read file" });
      return;
    }

    response.writeHead(200, { "Content-Type": asset.type });
    response.end(content);
  });
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", reject);
  });
}

function validateSubmission(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const subject = String(payload.subject || "").trim();
  const message = String(payload.message || "").trim();

  if (!name || !email || !subject || !message) {
    return { ok: false, error: "All fields are required." };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return {
    ok: true,
    value: { name, email, subject, message },
  };
}

async function forwardToWeb3Forms(submission) {
  if (!web3FormsAccessKey) {
    throw new Error("Server is missing WEB3FORMS_ACCESS_KEY");
  }

  const outboundPayload = {
    access_key: web3FormsAccessKey,
    subject: "New enquiry from Sheeps and Giggles Community Farm",
    from_name: "Sheeps and Giggles Community Farm Website",
    name: submission.name,
    email: submission.email,
    message: submission.message,
    botcheck: "",
  };

  if (submission.subject) {
    outboundPayload.subject = `${outboundPayload.subject}: ${submission.subject}`;
  }

  const web3FormsResponse = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(outboundPayload),
  });

  const contentType = web3FormsResponse.headers.get("content-type") || "";
  const rawBody = await web3FormsResponse.text();
  let result = null;

  if (contentType.includes("application/json")) {
    try {
      result = JSON.parse(rawBody);
    } catch {
      throw new Error("Web3Forms returned invalid JSON");
    }
  } else if (web3FormsResponse.status === 403) {
    throw new Error(
      "Web3Forms rejected the server-side request. Their docs require a paid plan and server IP safelisting for backend submissions."
    );
  } else {
    const preview = rawBody.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(`Web3Forms returned a non-JSON response (${web3FormsResponse.status}). ${preview}`);
  }

  if (!web3FormsResponse.ok || !result.success) {
    throw new Error(result.message || result.error || "Unable to send enquiry");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "test-backend",
      submissions: submissions.length,
      now: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/submissions") {
    sendJson(response, 200, { count: submissions.length, items: submissions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/contact") {
    try {
      const payload = await collectBody(request);
      const result = validateSubmission(payload);

      if (!result.ok) {
        sendJson(response, 400, { ok: false, error: result.error });
        return;
      }

      const submission = {
        id: submissions.length + 1,
        ...result.value,
        receivedAt: new Date().toISOString(),
      };

      await forwardToWeb3Forms(submission);
      submissions.push(submission);
      console.log("New contact submission:", submission);
      sendJson(response, 201, {
        ok: true,
        message: "Thanks. Your enquiry has been sent.",
        submission,
      });
    } catch (error) {
      const statusCode = error.message === "Invalid JSON" ? 400 : 500;
      sendJson(response, statusCode, { ok: false, error: error.message });
    }
    return;
  }

  if (request.method === "GET") {
    serveFile(response, url.pathname);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, host, () => {
  if (!web3FormsAccessKey) {
    console.warn("WEB3FORMS_ACCESS_KEY is not set. Contact submissions will fail until it is configured.");
  }
  console.log(`Server running at http://${host}:${port}`);
});
