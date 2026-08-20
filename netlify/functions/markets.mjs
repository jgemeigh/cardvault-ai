
function norm(s=""){return String(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function numberOnly(s=""){return String(s).split("/")[0].replace(/^0+/,"")||"0"}
function setScore(a,b){
 const x=norm(a),y=norm(b); if(!x||!y)return 0;
 if(x===y)return 1;
 if(x.includes(y)||y.includes(x))return .82;
 const ax=new Set(x.split(" ")), by=y.split(" ");
 return by.filter(w=>ax.has(w)).length/Math.max(ax.size,by.length);
}
function chooseTcgVariant(card,variantHint=""){
 const p=card?.pricing?.tcgplayer||{};
 const entries=Object.entries(p).filter(([k,v])=>v&&typeof v==="object"&&k!=="updated");
 if(!entries.length)return {label:null,data:{}};
 const hint=norm(variantHint);
 const wantsFirst=/(^| )(1st|first)( |$)/.test(hint)||hint.includes("1st edition")||hint.includes("first edition");
 const wantsUnlimited=hint.includes("unlimited");
 const wantsReverse=hint.includes("reverse");
 const wantsHolo=hint.includes("holo")&&!wantsReverse;
 const score=([k])=>{
   const n=norm(k);
   let s=0;
   if(wantsReverse&&n.includes("reverse"))s+=8;
   if(wantsHolo&&n.includes("holo")&&!n.includes("reverse"))s+=6;
   if(wantsFirst&&n.includes("1st"))s+=10;
   if(wantsUnlimited&&n.includes("unlimited"))s+=10;
   if(!wantsFirst&&(n.includes("unlimited")||n==="normal"))s+=6;
   if(!wantsFirst&&n.includes("1st"))s-=6;
   if(n==="normal")s+=1;
   return s;
 };
 entries.sort((a,b)=>score(b)-score(a));
 return {label:entries[0][0],data:entries[0][1]||{}};
}
async function tcgdexLookup(name,number,setName,variant){
 const local=numberOnly(number);
 const qs=new URLSearchParams({name:`eq:${name}`,localId:`eq:${local}`});
 let r=await fetch("https://api.tcgdex.net/v2/en/cards?"+qs);
 let brief=r.ok?await r.json():[];
 if(!Array.isArray(brief)||!brief.length){
   const qs2=new URLSearchParams({name,localId:local});
   r=await fetch("https://api.tcgdex.net/v2/en/cards?"+qs2);
   brief=r.ok?await r.json():[];
 }
 if(!Array.isArray(brief)||!brief.length)return {matched:null,message:"No TCGdex candidate found."};
 const full=[];
 for(const b of brief.slice(0,10)){
   try{
     const rr=await fetch("https://api.tcgdex.net/v2/en/cards/"+encodeURIComponent(b.id));
     if(rr.ok)full.push(await rr.json());
   }catch{}
 }
 if(!full.length)return {matched:null,message:"TCGdex candidates could not be loaded."};
 full.sort((a,b)=>setScore(b.set?.name,setName)-setScore(a.set?.name,setName));
 const best=full[0], ss=setScore(best.set?.name,setName);
 const nameExact=norm(best.name)===norm(name);
 const numExact=numberOnly(best.localId)===local;
 const confidence=Math.min(1,(nameExact?.45:0)+(numExact?.35:0)+ss*.20);
 if(confidence<.62)return {matched:null,message:"Candidates found, but none matched confidently enough.",confidence};
 const v=chooseTcgVariant(best,variant);
 return {
   matched:{id:best.id,name:best.name,set:best.set?.name,number:best.localId,image:best.image},
   confidence,
   variantLabel:v.label,
   bestVariant:v.data,
   pricing:best.pricing||{}
 };
}
async function pptLookup(name,number,setName){
 const key=globalThis.Netlify?.env?.get?.("POKEMON_PRICE_TRACKER_API_KEY")||process.env.POKEMON_PRICE_TRACKER_API_KEY;
 if(!key)return {configured:false};
 const q=[name,setName,number?`#${numberOnly(number)}`:""].filter(Boolean).join(" ");
 const url=new URL("https://www.pokemonpricetracker.com/api/v2/cards");
 url.searchParams.set("search",q); url.searchParams.set("limit","5"); url.searchParams.set("includeEbay","true");
 const r=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"}});
 const raw=await r.text(); let j;
 try{j=JSON.parse(raw)}catch{return {configured:true,error:`Non-JSON response (${r.status})`}}
 if(!r.ok)return {configured:true,error:j?.error||j?.message||`HTTP ${r.status}`};
 const arr=Array.isArray(j.data)?j.data:(j.data?[j.data]:[]);
 if(!arr.length)return {configured:true,error:"No matching card returned."};
 const local=numberOnly(number);
 arr.sort((a,b)=>{
   const sa=(norm(a.name)===norm(name)?4:0)+(numberOnly(a.cardNumber||a.card_number)===local?3:0)+setScore(a.setName||a.set_name,setName)*2;
   const sb=(norm(b.name)===norm(name)?4:0)+(numberOnly(b.cardNumber||b.card_number)===local?3:0)+setScore(b.setName||b.set_name,setName)*2;
   return sb-sa;
 });
 return {configured:true,card:arr[0],credits:j.metadata||null};
}
export default async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 try{
   const {name,number,setName,variant}=await req.json();
   if(!name)return Response.json({error:"Card name required"},{status:400});
   const [tcgdex,pokemonPriceTracker]=await Promise.all([
     tcgdexLookup(name,number,setName,variant),
     pptLookup(name,number,setName)
   ]);
   return Response.json({tcgdex,pokemonPriceTracker,updatedAt:new Date().toISOString()});
 }catch(e){return Response.json({error:e?.message||"Market lookup failed"},{status:500})}
};
export const config={path:"/api/markets"};
