# Deployment Checklist & Environment Variables

This document outlines the necessary steps and environment variables required to move this project from development to production.

## 1. Backend Environment Variables (.env)
Ensure these variables are set in your production environment (e.g., Vercel, Heroku, AWS):

| Variable | Description | Example / Required |
|----------|-------------|-------------------|
| `MONGODB_URI` | Your MongoDB connection string | `mongodb+srv://...` |
| `JWT_SECRET` | A long, random string for signing tokens | `openssl rand -base64 32` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs | `https://your-app.com` |
| `NODE_ENV` | Set to `production` | `production` |

## 2. Frontend Environment Variables (.env.local)
| Variable | Description | Example / Required |
|----------|-------------|-------------------|
| `NEXT_PUBLIC_API_BASE_URL` | The URL of your backend API | `https://api.your-app.com` |

## 3. Production Hardening Completed
- [x] **Strict CORS**: Only origins in `ALLOWED_ORIGINS` are permitted.
- [x] **Error Handling**: Stack traces are hidden in production; generic error messages are shown to users.
- [x] **URL Standardization**: All frontend API calls use `API_BASE_URL` instead of `localhost`.
- [x] **Rate Limiting**: Login endpoints are protected against brute-force attacks (10 attempts per 15 min in production).
- [x] **JWT Security**: Application will fail-fast if `JWT_SECRET` is missing.

## 4. Deployment Steps
1. **Database**: Ensure your MongoDB cluster has the correct IP whitelist for your deployment server.
2. **Build Backend**: Run `npm run build` in the backend directory.
3. **Build Frontend**: Run `npm run build` in the frontend directory.
4. **Environment**: Inject all variables listed above into your CI/CD or hosting provider.
