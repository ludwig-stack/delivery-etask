declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_USERS_JSON?: string;
    SESSION_SECRET?: string;
  }
}
