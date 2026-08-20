
const schema={
type:"object",additionalProperties:false,
properties:{
gradable:{type:"boolean"},
image_type:{type:"string"},
grade_low:{type:"number"},
grade_high:{type:"number"},
confidence:{type:"number"},
centering:{
 type:"object",additionalProperties:false,
 properties:{
   front_left_right:{type:"string"},
   front_top_bottom:{type:"string"},
   back_left_right:{type:"string"},
   back_top_bottom:{type:"string"},
   assessment:{type:"string"}
 },
 required:["front_left_right","front_top_bottom","back_left_right","back_top_bottom","assessment"]
},
corners:{
 type:"object",additionalProperties:false,
 properties:{
   geometry:{type:"string"},
   severity:{type:"string"},
   findings:{type:"array",items:{type:"string"}}
 },
 required:["geometry","severity","findings"]
},
edges:{type:"object",additionalProperties:false,properties:{severity:{type:"string"},findings:{type:"array",items:{type:"string"}}},required:["severity","findings"]},
surface:{type:"object",additionalProperties:false,properties:{severity:{type:"string"},findings:{type:"array",items:{type:"string"}}},required:["severity","findings"]},
print_quality:{type:"object",additionalProperties:false,properties:{severity:{type:"string"},findings:{type:"array",items:{type:"string"}}},required:["severity","findings"]},
limiting_defects:{type:"array",items:{type:"string"}},
summary:{type:"string"}
},
required:["gradable","image_type","grade_low","grade_high","confidence","centering","corners","edges","surface","print_quality","limiting_defects","summary"]};

export default async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 try{
  const {front,back,cardName,cardNumber,setName}=await req.json();
  if(!front||!back)return Response.json({error:"front and back required"},{status:400});
  const base=(process.env.OPENAI_BASE_URL||"").replace(/\/$/,"");
  const key=process.env.OPENAI_API_KEY;
  if(!base||!key)throw new Error("Netlify AI Gateway is not active yet.");

  const rules=`This is a blind physical-card image appraisal. You are not given seller condition, prior grade, expected grade, listing notes, or any previous appraisal.
      Use ONLY visible pixels in the supplied front and back images.
      Pokemon card corners are intentionally ROUNDED. Never penalize normal rounded geometry.
      Judge corners only by visible whitening, bends, dents, peeling, crushing, deformation, or inconsistent radius.
      Never write "possible wear", "may have wear", "wear not visible", or reduce a grade for a defect you cannot actually point to.
      If no defect is visible in a category, say "No visible defect in supplied image."
      Centering is mandatory: estimate front left/right, front top/bottom, back left/right, and back top/bottom borders as approximate X/Y percentages when the borders are visible.
      If perspective, crop, sleeve, holder, or angle makes centering unreliable, say "unreliable" instead of inventing a ratio.
      Repeated analyses of the same image must be performed fresh from the pixels; do not assume or reuse any previous conclusion.
      A visually clean and well-centered card can legitimately land in the 9-10 range. Every deduction must be traceable to a visible feature.`;

  const content=[
   {type:"text",text:`Card: ${cardName||"unknown"} ${cardNumber||""} ${setName||""}.
${rules}
Return concise structured findings. Every limiting defect must correspond to something actually visible.`},
   {type:"image_url",image_url:{url:front,detail:"high"}},
   {type:"image_url",image_url:{url:back,detail:"high"}}
  ];

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  const r=await fetch(base+"/v1/chat/completions",{
    method:"POST",signal:controller.signal,
    headers:{"content-type":"application/json","authorization":"Bearer "+key},
    body:JSON.stringify({
      model:"gpt-4.1-mini",
      messages:[{role:"user",content}],
      temperature:0,
      response_format:{type:"json_schema",json_schema:{name:"card_appraisal",strict:true,schema}}
    })
  });
  clearTimeout(timer);
  const raw=await r.text();
  let j;
  try{j=JSON.parse(raw)}catch{throw new Error("AI gateway returned a non-JSON response")}
  if(!r.ok)throw new Error(j.error?.message||"AI appraisal failed");
  return Response.json({appraisal:JSON.parse(j.choices?.[0]?.message?.content||"{}")});
 }catch(e){
  return Response.json({
    error:e?.name==="AbortError"
      ?"Appraisal took too long. Try again."
      :(e?.message||"Appraisal failed")
  },{status:500});
 }
};
export const config={path:"/api/appraise"};
