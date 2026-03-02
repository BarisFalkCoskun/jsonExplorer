import { maskConnectionString } from "utils/functions";

describe("maskConnectionString", () => {
  it("masks password in standard connection string", () => {
    expect(maskConnectionString("mongodb://user:secret@host:27017/db"))
      .toBe("mongodb://user:****@host:27017/db");
  });

  it("masks password in SRV connection string", () => {
    expect(maskConnectionString("mongodb+srv://admin:p4ss@cluster.mongodb.net/mydb"))
      .toBe("mongodb+srv://admin:****@cluster.mongodb.net/mydb");
  });

  it("leaves strings without credentials unchanged", () => {
    expect(maskConnectionString("mongodb://host:27017/db"))
      .toBe("mongodb://host:27017/db");
  });

  it("handles connection strings with no password", () => {
    expect(maskConnectionString("mongodb://user@host:27017"))
      .toBe("mongodb://user@host:27017");
  });

  it("handles special characters in password", () => {
    expect(maskConnectionString("mongodb://user:p%40ss%3Aword@host/db"))
      .toBe("mongodb://user:****@host/db");
  });
});
