import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/write-origin";
import { isTestCategoryWriteAllowed, parseCategoryAssignment } from "@/lib/category-persistence-input";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function reply(data:unknown,status=200){
 return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
}
export async function GET(request:NextRequest){
 const access=await getOwnerAccess();
 if(access.kind!=="authorized")return reply({error:"조회 권한이 없습니다."},403);
 const modId=request.nextUrl.searchParams.get("modId");
 if(!modId||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(modId))
   return reply({error:"모드 UUID가 올바르지 않습니다."},400);
 const {data:mod,error:modError}=await access.supabase.from("mods")
  .select("id").eq("id",modId).eq("owner_id",access.user.id).maybeSingle();
 if(modError)return reply({error:"모드 조회 실패"},503);
 if(!mod)return reply({error:"본인 소유 모드가 없습니다."},404);
 const [members,primary]=await Promise.all([
  access.supabase.from("mod_categories").select("category_id").eq("owner_id",access.user.id).eq("mod_id",modId).limit(65),
  access.supabase.from("mod_category_primary").select("category_id").eq("owner_id",access.user.id).eq("mod_id",modId).maybeSingle()
 ]);
 if(members.error||primary.error||!members.data||members.data.length>64)
   return reply({error:"카테고리 연결 조회 실패"},503);
 if((members.data.length===0)!==(primary.data===null))
   return reply({error:"카테고리 대표 연결이 불일치합니다."},503);
 return reply({modId,categoryIds:members.data.map(row=>row.category_id),
  primaryCategoryId:primary.data?.category_id??null});
}
export async function POST(request:NextRequest){
 if(!isSameOriginRequest(request.url,request.headers.get("origin"))
  ||!isTestCategoryWriteAllowed(process.env))return reply({error:"이 배포에서는 저장할 수 없습니다."},403);
 const access=await getOwnerAccess();
 if(access.kind!=="authorized")return reply({error:"저장 권한이 없습니다."},403);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>6000)return reply({error:"입력 크기 초과"},413);body=JSON.parse(raw);}
 catch{return reply({error:"잘못된 JSON"},400);}
 const value=parseCategoryAssignment(body);
 if(!value)return reply({error:"모드 카테고리와 대표 카테고리를 확인하세요."},400);
 const {error}=await access.supabase.rpc("save_mod_categories",{
  p_mod_id:value.modId,p_category_ids:value.categoryIds,
  p_primary_category_id:value.primaryCategoryId
 });
 if(error)return reply({error:error.code==="42501"?"모드 또는 카테고리에 접근할 수 없습니다.":"카테고리 저장 실패"},error.code==="42501"?403:503);
 return reply({saved:true,modId:value.modId,categoryIds:value.categoryIds,primaryCategoryId:value.primaryCategoryId});
}
