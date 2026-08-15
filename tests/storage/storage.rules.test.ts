import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";

const projectId="demo-kabinet-25"; let environment:RulesTestEnvironment;
beforeAll(async()=>{environment=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(fileURLToPath(new URL("../../firebase/firestore.rules",import.meta.url)),"utf8")},storage:{rules:readFileSync(fileURLToPath(new URL("../../firebase/storage.rules",import.meta.url)),"utf8")}});await environment.withSecurityRulesDisabled(async(context)=>{const db=context.firestore();await setDoc(doc(db,"users","teacher-1"),{role:"teacher",teacherId:null,studentId:null});await setDoc(doc(db,"users","student-auth-1"),{role:"student",teacherId:"teacher-1",studentId:"student-1"});});});
afterAll(async()=>environment.cleanup());
describe("Storage Rules",()=>{test("allows the owning student and teacher to upload homework files",async()=>{const path="homework/teacher-1/student-1/homework-1/work.txt";await assertSucceeds(uploadBytes(ref(environment.authenticatedContext("student-auth-1").storage(),path),new Blob(["work"],{type:"text/plain"})));await assertSucceeds(uploadBytes(ref(environment.authenticatedContext("teacher-1").storage(),"homework/teacher-1/student-1/homework-1/feedback.txt"),new Blob(["ok"],{type:"text/plain"})));});test("denies anonymous, unrelated and unsafe uploads",async()=>{const path="homework/teacher-1/student-1/homework-1/private.txt";await assertFails(uploadBytes(ref(environment.unauthenticatedContext().storage(),path),new Blob(["x"],{type:"text/plain"})));await assertFails(uploadBytes(ref(environment.authenticatedContext("student-2").storage(),path),new Blob(["x"],{type:"text/plain"})));await assertFails(uploadBytes(ref(environment.authenticatedContext("student-auth-1").storage(),"homework/teacher-1/student-1/homework-1/run.exe"),new Blob(["x"],{type:"application/x-msdownload"})));});});
