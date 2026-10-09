import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../index";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "mysql://user:password@localhost:3306/embaixador",
  JWT_SIGNING_KEY: "signing-key-for-tests-only",
  SOURCE_URL_ENCRYPTION_KEY: "source-key-for-tests-only",
  FRONTEND_ORIGIN: "https://embaixador.example",
  S3_REGION: "us-east-1",
  S3_BUCKET: "embaixador-private",
  S3_ACCESS_KEY_ID: "access-key-for-tests-only",
  S3_SECRET_ACCESS_KEY: "secret-key-for-tests-only",
  MEDIA_TEMP_DIRECTORY: "/tmp/embaixador",
  YT_DLP_PATH: "/usr/bin/yt-dlp",
  FFMPEG_PATH: "/usr/bin/ffmpeg",
};

describe("loadEnvironment", () => {
  it("uses development defaults without requiring production secrets", () => {
    const environment = loadEnvironment({ NODE_ENV: "test" });

    expect(environment.port).toBe(8080);
    expect(environment.nodeEnv).toBe("test");
    expect(environment.databaseUrl).toBeUndefined();
  });

  it("parses an explicit valid port", () => {
    expect(loadEnvironment({ NODE_ENV: "test", PORT: "4321" }).port).toBe(4321);
  });

  it("rejects unsupported environment names and malformed production origins", () => {
    expect(() => loadEnvironment({ NODE_ENV: "staging" })).toThrow("NODE_ENV must be development, test, or production");

    expect(() => loadEnvironment({
      ...productionEnvironment,
      FRONTEND_ORIGIN: "not an origin",
    })).toThrow("FRONTEND_ORIGIN must be a valid HTTPS origin");
    expect(() => loadEnvironment({
      ...productionEnvironment,
      FRONTEND_ORIGIN: "http://embaixador.example",
    })).toThrow("FRONTEND_ORIGIN must be a valid HTTPS origin");
  });

  it.each(["0", "65536", "not-a-port", "3000.5"]) (
    "rejects invalid PORT value %s",
    (port) => {
      expect(() => loadEnvironment({ NODE_ENV: "test", PORT: port })).toThrow(
        "PORT must be an integer between 1 and 65535",
      );
    },
  );

  it("requires production secrets and reports names without echoing values", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "production",
        JWT_SIGNING_KEY: "do-not-echo-this-secret",
      }),
    ).toThrow(/DATABASE_URL.*SOURCE_URL_ENCRYPTION_KEY/);

    try {
      loadEnvironment({
        NODE_ENV: "production",
        JWT_SIGNING_KEY: "do-not-echo-this-secret",
      });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-echo-this-secret");
    }
  });

  it("returns configured production values after required variables are present", () => {
    const environment = loadEnvironment(productionEnvironment);

    expect(environment.nodeEnv).toBe("production");
    expect(environment.databaseUrl).toBe(productionEnvironment.DATABASE_URL);
    expect(environment.frontendOrigin).toBe(productionEnvironment.FRONTEND_ORIGIN);
    expect(environment.s3Bucket).toBe(productionEnvironment.S3_BUCKET);
  });
});