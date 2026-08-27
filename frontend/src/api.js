const json = async (res) => {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
};

export const api = {
  report: () => fetch("/api/report").then(json),
  importFile: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/import", { method: "POST", body: fd }).then(json);
  },
  saveReceived: (payload) =>
    fetch("/api/received", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(json),
  saveSettings: (settings) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }).then(json),
};
