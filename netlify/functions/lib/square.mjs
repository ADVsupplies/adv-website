const BASE =
  process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

export class SquareError extends Error {
  constructor(status, errors) {
    super((errors || []).map((e) => e.detail || e.code).join("; ") || `Square HTTP ${status}`);
    this.status = status;
    this.errors = errors || [];
  }
}

export async function sq(path, { method = "GET", body } = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set in Netlify environment variables");
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new SquareError(res.status, json.errors);
  return json;
}
