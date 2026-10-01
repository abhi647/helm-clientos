const NAME = "helm-files";
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function storeFile(id, file) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}
export async function getFile(id) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("files", "readonly");
    const req = tx.objectStore("files").get(id);
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => database.close();
  });
}
export async function extractText(file) {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Use a file smaller than 25 MB.");
  const extension = file.name.split(".").at(-1).toLowerCase();
  if (["txt", "md"].includes(extension)) return file.text();
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return result.value;
  }
  if (extension === "pdf") {
    const pdf = await import("pdfjs-dist");
    pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const document = await pdf.getDocument({ data: await file.arrayBuffer() })
      .promise;
    let text = "";
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      text +=
        `\n[Page ${page}]\n` +
        content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("");
    }
    await document.destroy();
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 30)
      throw new Error(
        "This PDF needs OCR. Upload a text-based PDF, DOCX, or paste its text.",
      );
    return text;
  }
  throw new Error("Upload PDF, DOCX, TXT or Markdown.");
}
