
const schema={
type:"object",additionalProperties:false,
properties:{
name:{type:"string"},collector_number:{type:"string"},set_name:{type:"string"},
set_symbol_description:{type:"string"},language:{type:"string"},rarity:{type:"string"},
variant:{type:"string"},card_type:{type:"string"},hp:{type:"string"},confidence:{type:"number"},
visible_evidence:{type:"array",items:{type:"string"}},search_query:{type:"string"}},
required:["name","collector_number","set_name","set_symbol_description","language","rarity","variant","card_type","hp","confidence","visible_evidence","search_query"]};

export default async(req)=>{
 if(req.method!=="POST") return new Response("Method not allowed",{status:405});
 try{
  const {front,back}=await req.json();
  if(!front) return Response.json({error:"front image required"},{status:400});
  const base=(process.env.OPENAI_BASE_URL||"").replace(/\/$/,"");
  const key=process.env.OPENAI_API_KEY;
  if(!base||!key) throw new Error("Netlify AI Gateway is not active yet.");
  const content=[
   {type:"text",text:"Identify this physical Pokemon TCG card using only visible pixels. Read name, collector number, set clues, language, HP, rarity/variant, and card type. Do not use filenames or metadata. Lower confidence when uncertain."},
   {type:"image_url",image_url:{url:front,detail:"high"}}
  ];
  if(back) content.push({type:"image_url",image_url:{url:back,detail:"high"}});
  const r=await fetch(base+"/v1/chat/completions",{method:"POST",headers:{
    "content-type":"application/json","authorization":"Bearer "+key
  },body:JSON.stringify({
    model:"gpt-4.1-mini",
    messages:[{role:"user",content}],
    response_format:{type:"json_schema",json_schema:{name:"pokemon_card_id",strict:true,schema}}
  })});
  const j=await r.json();
  if(!r.ok) throw new Error(j.error?.message||"AI identification failed");
  const identification=JSON.parse(j.choices?.[0]?.message?.content||"{}");
  let catalogCandidates=[];
  try{
    const terms=[];
    if(identification.name) terms.push(`name:"${identification.name.replaceAll('"',"")}"`);
    if(identification.collector_number){
      const n=identification.collector_number.split("/")[0].trim();
      if(n) terms.push(`number:"${n.replaceAll('"',"")}"`);
    }
    if(terms.length){
      const rr=await fetch("https://api.pokemontcg.io/v2/cards?q="+encodeURIComponent(terms.join(" "))+"&pageSize=10");
      if(rr.ok){
        const jj=await rr.json();
        catalogCandidates=(jj.data||[]).map(c=>({
          id:c.id,name:c.name,number:c.number,set:c.set?.name||"",rarity:c.rarity||"",
          image:c.images?.small||c.images?.large||""
        }));
      }
    }
  }catch{}
  return Response.json({identification,catalogCandidates});
 }catch(e){
  return Response.json({error:e?.message||"Identification failed"},{status:500});
 }
};
export const config={path:"/api/identify"};
