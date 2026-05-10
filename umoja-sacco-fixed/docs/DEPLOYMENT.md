# Deployment Guide

## Option 1: Docker Compose (Recommended for VPS)

```bash
git clone https://github.com/YOUR_USERNAME/umoja-sacco.git
cd umoja-sacco

# Copy and fill environment files
cp backend/.env.example backend/.env
nano backend/.env  # Fill in all values

# Start all services
docker-compose up -d

# Run migrations and seed (first time only)
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed
```

---

## Option 2: Manual (Node + PostgreSQL)

### PostgreSQL Setup
```bash
sudo -u postgres psql
CREATE DATABASE umoja_sacco;
CREATE USER umoja_user WITH PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE umoja_sacco TO umoja_user;
\q
```

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env
npm run migrate
npm run seed
# Production: use PM2
npm install -g pm2
pm2 start server.js --name umoja-api
pm2 save
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
# REACT_APP_API_URL=https://your-api-domain.com/api
npm run build
# Serve build/ with nginx or serve
```

---

## Option 3: Railway (Free tier)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL plugin
4. Set environment variables in Railway dashboard (from `.env.example`)
5. Deploy — Railway auto-detects Node.js

---

## Option 4: Render

**Backend:**
1. New Web Service → Connect GitHub repo → Root: `backend`
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Add PostgreSQL database from Render dashboard
5. Add all env vars

**Frontend:**
1. New Static Site → Root: `frontend`
2. Build Command: `npm run build`
3. Publish Directory: `build`
4. Set `REACT_APP_API_URL` to your backend URL

---

## Production Checklist

- [ ] Change all default passwords and JWT secrets
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (Let's Encrypt / Render / Railway handles this)
- [ ] Set `FRONTEND_URL` in backend `.env` to your actual domain
- [ ] Configure SMTP for email notifications
- [ ] Configure Africa's Talking for SMS (optional)
- [ ] Set up database backups
- [ ] Review rate limiting settings
- [ ] Remove seed data quick-login hints from LoginPage.jsx
