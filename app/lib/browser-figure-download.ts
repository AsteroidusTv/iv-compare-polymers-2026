/** Browser I/O only; scientific data and decisions are supplied by callers. */
import { applyReportSvgStyle } from "./report-svg";

const prepared: {url:string;row:HTMLElement}[]=[];
/** Keep a real user-clickable fallback: some embedded browsers suppress synthetic downloads. */
export function downloadFigureFile(contents: BlobPart, name: string, type: string) {
  const blob = contents instanceof Blob ? contents : new Blob([contents], {type});
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  let panel=document.getElementById("prepared-figure-exports");
  if(!panel){
    panel=document.createElement("aside");panel.id="prepared-figure-exports";panel.setAttribute("aria-label","Prepared figure exports");
    const heading=document.createElement("strong");heading.textContent="Export ready · click a filename if the download did not start";panel.appendChild(heading);
    const close=document.createElement("button");close.textContent="Close exports";close.onclick=()=>{for(const item of prepared)URL.revokeObjectURL(item.url);prepared.length=0;panel?.remove();};panel.appendChild(close);document.body.appendChild(panel);
  }
  const row=document.createElement("div");
  anchor.href=url;anchor.download=name;anchor.textContent=`${name} (${Math.ceil(blob.size/1024)} kB)`;row.appendChild(anchor);panel.appendChild(row);
  if(blob.type.startsWith("image/")){
    const preview=document.createElement("details"),summary=document.createElement("summary"),image=document.createElement("img");
    summary.textContent=`Preview ${name}`;image.src=url;image.alt=`Export preview ${name}`;image.style.maxWidth="100%";preview.append(summary,image);row.appendChild(preview);
  }else{
    const copy=document.createElement("button");copy.textContent=`Copy ${name}`;
    copy.onclick=()=>{void blob.text().then(text=>navigator.clipboard.writeText(text)).then(()=>{copy.textContent=`Copied ${name}`;}).catch(()=>{copy.textContent=`Copy failed — download ${name}`;});};row.appendChild(copy);
  }
  prepared.push({url,row});while(prepared.length>6){const oldest=prepared.shift()!;URL.revokeObjectURL(oldest.url);oldest.row.remove();}
  anchor.click();
}
export async function downloadScientificGraphic(svg: SVGSVGElement, width: number, height: number, manifest: unknown, stem: string, format: "svg" | "png", preset: "default" | "report" = "default") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width",String(width)); clone.setAttribute("height",String(height));
  clone.style.background = "white"; clone.style.fontFamily = "Arial, sans-serif";
  const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata"); metadata.textContent = JSON.stringify(manifest); clone.appendChild(metadata);
  if (preset === "report") applyReportSvgStyle(clone);
  const outputStem = preset === "report" ? `${stem}.report` : stem;
  const content = new XMLSerializer().serializeToString(clone);
  if (format === "svg") downloadFigureFile(content, `${outputStem}.svg`, "image/svg+xml;charset=utf-8");
  else {
    const url=URL.createObjectURL(new Blob([content],{type:"image/svg+xml"}));
    try {
      const image=new Image();
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("PNG rendering failed"));image.src=url;});
      const canvas=document.createElement("canvas"); canvas.width=width*3; canvas.height=height*3;
      const context=canvas.getContext("2d"); if(!context) throw new Error("Canvas unavailable");
      context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png")); if(!blob) throw new Error("PNG export failed");
      downloadFigureFile(blob,`${outputStem}.png`,"image/png");
    } finally {URL.revokeObjectURL(url);}
  }
  downloadFigureFile(JSON.stringify(manifest,null,2),`${outputStem}.figure.json`,"application/json");
}
