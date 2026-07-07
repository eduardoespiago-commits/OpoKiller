// Thin wrapper: unzip a .docx and hand its document.xml to the pure parser.
import JSZip from "jszip";
import { parseDocumentXml, type DocxDoc } from "../domain/docx";

export async function readDocx(input: File | ArrayBuffer): Promise<DocxDoc> {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("El archivo .docx no contiene word/document.xml");
  const xml = await docFile.async("string");
  return parseDocumentXml(xml);
}
