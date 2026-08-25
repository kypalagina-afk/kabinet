import { describe, expect, test } from "vitest";
import { parseFirebaseCredential } from "../../backend/yandex/src/firebaseCredential.js";

const credential = {
  project_id: "kabinet-25",
  client_email: "backend@kabinet-25.iam.gserviceaccount.com",
  private_key: "private-key-placeholder",
};

describe("Firebase backend credential parser", () => {
  test("accepts a raw JSON Lockbox text value", () => {
    expect(parseFirebaseCredential("kabinet-25", JSON.stringify(credential))).toEqual(credential);
  });

  test("accepts a base64 Lockbox file value", () => {
    const encoded = Buffer.from(JSON.stringify(credential), "utf8").toString("base64");
    expect(parseFirebaseCredential("kabinet-25", encoded)).toEqual(credential);
  });

  test("fails closed for another Firebase project", () => {
    expect(() => parseFirebaseCredential("kabinet-25", JSON.stringify({ ...credential, project_id: "other" }))).toThrow(
      "Firebase credential project mismatch",
    );
  });

  test("fails closed when required credential fields are missing", () => {
    expect(() => parseFirebaseCredential("kabinet-25", JSON.stringify({ project_id: "kabinet-25" }))).toThrow(
      "Firebase credential is incomplete",
    );
  });
});
