import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/write-origin";
import { isTestCategoryWriteAllowed, parseCategoryCreate } from "@/lib/category-persistence-input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
 return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
}
export async function GET() {
 const access=await getOwnerAccess();
 if(access.kind!=="authorized")return reply({error:"조회 권한이 없습니다."},403);
 const {data,error}=await access.supabase.from("categories")
   .select("id,name,sort_order").eq("owner_id",access.user.id)
   .order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(501);
 if(error||!data||data.length>500)return reply({error:"카테고리를 조회하지 못했습니다."},503);
 return reply({categories:data});
}
export async function POST(request:NextRequest) {
 if(!isSameOriginRequest(request.url,request.headers.get("origin"))
   ||!isTestCategoryWriteAllowed(process.env))return reply({error:"이 배포에서 등록할 수 없습니다."},403);
 const access=await getOwnerAccess();
 if(access.kind!=="authorized")return reply({error:"등록 권한이 없습니다."},403);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>1024)return reply({error:"입력 크기 초과"},413);body=JSON.parse(raw);}
 catch{return reply({error:"잘못된 JSON"},400);}
 const value=parseCategoryCreate(body);
 if(!value)return reply({error:"카테고리 이름이 올바르지 않습니다."},400);
 const {data,error}=await access.supabase.from("categories")
   .insert({owner_id:access.user.id,name:value.name}).select("id,name,sort_order").single();
 if(error)return reply({error:error.code==="23505"?"이미 존재하는 카테고리입니다.":"카테고리를 저장할 수 없습니다."},error.code==="23505"?409:503);
 return reply({category:data},201);
}
