import assert from "node:assert/strict";
import test from "node:test";
import {
 isTestCategoryWriteAllowed,parseCategoryCreate,parseCategoryUpdate,parseCategoryDelete,
 parseCategoryAssignment,isStoredCategoryPrimaryConsistent
} from "../lib/category-persistence-input";
const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const c="33333333-3333-4333-8333-333333333333";
const env={
 VERCEL_ENV:"preview",VERCEL_TARGET_ENV:"preview",
 VERCEL_PROJECT_ID:"prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
 VERCEL_GIT_COMMIT_REF:"test/category-preview-origin-guard-20261122",
 NEXT_PUBLIC_SUPABASE_URL:"https://smofdbjgcgdmscamknpw.supabase.co",
 MOD_CATEGORY_TEST_WRITE_ENABLED:"true"
};
test("only exact test Preview opt-in within expiry can write",()=>{
 const now = Date.parse("2026-11-23T00:00:00+09:00");
 assert.equal(isTestCategoryWriteAllowed(env,now),true);
 for(const [key,value] of [
  ["VERCEL_ENV","production"],["VERCEL_TARGET_ENV","production"],
  ["VERCEL_PROJECT_ID","other"],["VERCEL_GIT_COMMIT_REF","main"],
  ["NEXT_PUBLIC_SUPABASE_URL","https://example.test"],["MOD_CATEGORY_TEST_WRITE_ENABLED","false"]
 ])assert.equal(isTestCategoryWriteAllowed({...env,[key]:value},now),false,key);
 assert.equal(isTestCategoryWriteAllowed({...env,MOD_CATEGORY_TEST_WRITE_ENABLED:undefined},now),false);
 assert.equal(isTestCategoryWriteAllowed(env,Date.parse("2026-11-24T00:00:00+09:00")),false);
 assert.equal(isTestCategoryWriteAllowed(env,Number.NaN),false);
});
test("category creation rejects extra fields and untrimmed names",()=>{
 assert.deepEqual(parseCategoryCreate({name:"의상"}),{name:"의상"});
 for(const input of [{name:""},{name:" 의상"},{name:"의상 "},{name:"x",owner_id:a},null,[]])
  assert.equal(parseCategoryCreate(input),null);
});
test("category update and delete require exact UUID and valid trimmed name",()=>{
 assert.deepEqual(parseCategoryUpdate({id:a.toUpperCase(),name:"무기"}),{id:a,name:"무기"});
 for(const input of [{id:"bad",name:"무기"},{id:a,name:""},{id:a,name:" 무기"},{id:a,name:"무기",extra:1},null])
  assert.equal(parseCategoryUpdate(input),null);
 assert.deepEqual(parseCategoryDelete({id:a.toUpperCase()}),{id:a});
 for(const input of [{id:"bad"},{id:a,extra:1},{},null])
  assert.equal(parseCategoryDelete(input),null);
});
test("multiple categories with exactly one member primary are accepted",()=>{
 assert.deepEqual(parseCategoryAssignment({modId:a,categoryIds:[b,c],primaryCategoryId:c}),
 {modId:a,categoryIds:[b,c],primaryCategoryId:c});
});
test("unclassified assignment (0 categories and null primary) is accepted",()=>{
 assert.deepEqual(parseCategoryAssignment({modId:a,categoryIds:[],primaryCategoryId:null}),
 {modId:a,categoryIds:[],primaryCategoryId:null});
});
test("missing, duplicate and foreign primary category references are rejected",()=>{
 for(const input of [
  {modId:a,categoryIds:[],primaryCategoryId:b},
  {modId:a,categoryIds:[b],primaryCategoryId:null},
  {modId:a,categoryIds:[b,b],primaryCategoryId:b},
  {modId:a,categoryIds:[b],primaryCategoryId:c},
  {modId:a,categoryIds:[b],primaryCategoryId:b,owner_id:a},
  {modId:"not-uuid",categoryIds:[b],primaryCategoryId:b},
  {modId:a,categoryIds:["not-uuid"],primaryCategoryId:"not-uuid"}
 ])assert.equal(parseCategoryAssignment(input),null);
});

test("read guard requires primary to match an actual membership",()=>{
 assert.equal(isStoredCategoryPrimaryConsistent([{category_id:b},{category_id:c}],{category_id:c}),true);
 assert.equal(isStoredCategoryPrimaryConsistent([{category_id:b}],{category_id:c}),false);
 assert.equal(isStoredCategoryPrimaryConsistent([{category_id:b}],null),false);
 assert.equal(isStoredCategoryPrimaryConsistent([],{category_id:b}),false);
});
test("read guard accepts an unclassified mod and rejects duplicated response members",()=>{
 assert.equal(isStoredCategoryPrimaryConsistent([],null),true);
 assert.equal(isStoredCategoryPrimaryConsistent([{category_id:b},{category_id:b}],{category_id:b}),false);
 assert.equal(isStoredCategoryPrimaryConsistent([{category_id:""}],{category_id:""}),false);
 assert.equal(isStoredCategoryPrimaryConsistent(
  Array.from({length:65},(_,i)=>({category_id:String(i)})),{category_id:"0"}
 ),false);
});
