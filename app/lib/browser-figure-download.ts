/** Browser I/O only; scientific data and decisions are supplied by callers. */
export function downloadFigureFile(contents: BlobPart, name: string, type: string) {
  const blob = contents instanceof Blob ? contents : new Blob([contents], {type});
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
export async function downloadScientificGraphic(svg: SVGSVGElement, width: number, height: number, manifest: unknown, stem: string, format: "svg" | "png") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width",String(width)); clone.setAttribute("height",String(height));
  clone.style.background = "white"; clone.style.fontFamily = "Arial, sans-serif";
  const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata"); metadata.textContent = JSON.stringify(manifest); clone.appendChild(metadata);
  const content = new XMLSerializer().serializeToString(clone);
  if (format === "svg") downloadFigureFile(content, `${stem}.svg`, "image/svg+xml;charset=utf-8");
  else {
    const url=URL.createObjectURL(new Blob([content],{type:"image/svg+xml"}));
    try {
      const image=new Image();
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("PNG rendering failed"));image.src=url;});
      const canvas=document.createElement("canvas"); canvas.width=width*3; canvas.height=height*3;
      const context=canvas.getContext("2d"); if(!context) throw new Error("Canvas unavailable");
      context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png")); if(!blob) throw new Error("PNG export failed");
      downloadFigureFile(blob,`${stem}.png`,"image/png");
    } finally {URL.revokeObjectURL(url);}
  }
  downloadFigureFile(JSON.stringify(manifest,null,2),`${stem}.figure.json`,"application/json");
}
