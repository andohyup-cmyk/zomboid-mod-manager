import assert from "node:assert/strict";
import test from "node:test";
import {
 isTestCategoryWriteAllowed,parseCategoryCreate,parseCategoryAssignment
} from "../lib/category-persistence-input";
const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const c="33333333-3333-4333-8333-333333333333";
const env={
 VERCEL_ENV:"preview",VERCEL_TARGET_ENV:"preview",
 VERCEL_PROJECT_ID:"prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
 VERCEL_GIT_COMMIT_REF:"feature/test-mod-category-persistence-20261122",
 NEXT_PUBLIC_SUPABASE_URL:"https://smofdbjgcgdmscamknpw.supabase.co",
 MOD_CATEGORY_TEST_WRITE_ENABLED:"true"
};
test("only exact test Preview opt-in can write",()=>{
 assert.equal(isTestCategoryWriteAllowed(env),true);
 for(const [key,value] of [
  ["VERCEL_ENV","production"],["VERCEL_TARGET_ENV","production"],
  ["VERCEL_PROJECT_ID","other"],["VERCEL_GIT_COMMIT_REF","main"],
  ["NEXT_PUBLIC_SUPABASE_URL","https://example.test"],["MOD_CATEGORY_TEST_WRITE_ENABLED","false"]
 ])assert.equal(isTestCategoryWriteAllowed({...env,[key]:value}),false,key);
 assert.equal(isTestCategoryWriteAllowed({...env,MOD_CATEGORY_TEST_WRITE_ENABLED:undefined}),false);
});
test("category creation rejects extra fields and untrimmed names",()=>{
 assert.deepEqual(parseCategoryCreate({name:"의상"}),{name:"의상"});
 for(const input of [{name:""},{name:" 의상"},{name:"의상 "},{name:"x",owner_id:a},null,[]])
  assert.equal(parseCategoryCreate(input),null);
});
test("multiple categories with exactly one member primary are accepted",()=>{
 assert.deepEqual(parseCategoryAssignment({modId:a,categoryIds:[b,c],primaryCategoryId:c}),
 {modId:a,categoryIds:[b,c],primaryCategoryId:c});
});
test("missing, duplicate and foreign primary category references are rejected",()=>{
 for(const input of [
  {modId:a,categoryIds:[],primaryCategoryId:b},
  {modId:a,categoryIds:[b,b],primaryCategoryId:b},
  {modId:a,categoryIds:[b],primaryCategoryId:c},
  {modId:a,categoryIds:[b],primaryCategoryId:b,owner_id:a},
  {modId:"not-uuid",categoryIds:[b],primaryCategoryId:b},
  {modId:a,categoryIds:["not-uuid"],primaryCategoryId:"not-uuid"}
 ])assert.equal(parseCategoryAssignment(input),null);
});
