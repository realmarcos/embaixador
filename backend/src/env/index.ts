export interface EnvironmentConfiguration {
	port: number;
	nodeEnv: "development" | "test" | "production";
	databaseUrl?: string;
	jwtSigningKey?: string;
	sourceUrlEncryptionKey?: string;
	frontendOrigin?: string;
	s3Endpoint?: string;
	s3Region?: string;
	s3Bucket?: string;
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	mediaTempDirectory?: string;
	ytDlpPath?: string;
	ytDlpProxy?: string;
	ytDlpNoCheckCertificates: boolean;
	ffmpegPath?: string;
}

const productionRequiredVariables = [
	"DATABASE_URL",
	"JWT_SIGNING_KEY",
	"SOURCE_URL_ENCRYPTION_KEY",
	"FRONTEND_ORIGIN",
	"S3_REGION",
	"S3_BUCKET",
	"S3_ACCESS_KEY_ID",
	"S3_SECRET_ACCESS_KEY",
	"MEDIA_TEMP_DIRECTORY",
	"YT_DLP_PATH",
	"FFMPEG_PATH",
] as const;

export function loadEnvironment(
	values: NodeJS.ProcessEnv = process.env,
): EnvironmentConfiguration {
	const nodeEnv = values.NODE_ENV ?? "development";

	if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
		throw new Error("NODE_ENV must be development, test, or production");
	}

	const port = values.PORT === undefined ? 8080 : Number(values.PORT);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error("PORT must be an integer between 1 and 65535");
	}

	const noCheckCertificates = values.YT_DLP_NO_CHECK_CERTIFICATES?.trim() ?? "";
	if (!["", "true", "false"].includes(noCheckCertificates)) {
		throw new Error("YT_DLP_NO_CHECK_CERTIFICATES must be true or false");
	}

	const configuredProxy = values.YT_DLP_PROXY?.trim();
	const ytDlpProxy = configuredProxy?.length ? configuredProxy : undefined;
	if (ytDlpProxy) {
		try {
			const proxy = new URL(ytDlpProxy);
			const username = decodeURIComponent(proxy.username);
			const password = decodeURIComponent(proxy.password);
			const hasControlCharacters = [values.YT_DLP_PROXY ?? "", username, password].some(
				(value) => /\p{Cc}/u.test(value),
			);
			if (
				hasControlCharacters ||
				!/^http:\/\/[^/]/i.test(ytDlpProxy) || ytDlpProxy.includes("\\") ||
				proxy.protocol !== "http:" || !proxy.hostname ||
				(proxy.port !== "" && Number(proxy.port) < 1) ||
				proxy.pathname !== "/" || proxy.search !== "" || proxy.hash !== "" ||
				username.includes(":") || ytDlpProxy.includes("?") || ytDlpProxy.includes("#")
			) {
				throw new Error("Invalid proxy");
			}
		} catch {
			throw new Error("YT_DLP_PROXY must be a valid HTTP proxy URL");
		}
	}

	if (nodeEnv === "production") {
		const missing = productionRequiredVariables.filter((name) => !values[name]?.trim());
		if (missing.length > 0) {
			throw new Error(
				`Missing required production environment variables: ${missing.join(", ")}`,
			);
		}

		const frontendOrigin = values.FRONTEND_ORIGIN;
		if (frontendOrigin) {
			let parsedOrigin: URL;
			try {
				parsedOrigin = new URL(frontendOrigin);
			} catch {
				throw new Error("FRONTEND_ORIGIN must be a valid HTTPS origin");
			}

			if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== frontendOrigin) {
				throw new Error("FRONTEND_ORIGIN must be a valid HTTPS origin");
			}
		}
	}

	return {
		port,
		nodeEnv,
		databaseUrl: values.DATABASE_URL,
		jwtSigningKey: values.JWT_SIGNING_KEY,
		sourceUrlEncryptionKey: values.SOURCE_URL_ENCRYPTION_KEY,
		frontendOrigin: values.FRONTEND_ORIGIN,
		s3Endpoint: values.S3_ENDPOINT,
		s3Region: values.S3_REGION,
		s3Bucket: values.S3_BUCKET,
		s3AccessKeyId: values.S3_ACCESS_KEY_ID,
		s3SecretAccessKey: values.S3_SECRET_ACCESS_KEY,
		mediaTempDirectory: values.MEDIA_TEMP_DIRECTORY,
		ytDlpPath: values.YT_DLP_PATH,
		ytDlpProxy,
		ytDlpNoCheckCertificates: noCheckCertificates === "true",
		ffmpegPath: values.FFMPEG_PATH,
	};
}