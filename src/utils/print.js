// React escaping does not protect interpolated HTML print documents.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

export function printDocument(html, existingWindow) {
  const popup = existingWindow || window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`;
  popup.document.write(html.replace("<head>", `<head>${policy}`));
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
