/**
 * Axios API client
 * Handles base URL, auth headers, and automatic token refresh
 */

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor — handle token expiry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('umoja_refresh');
        const { data } = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
          { refreshToken }
        );
        const newToken = data.data.accessToken;
        localStorage.setItem('umoja_token', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      } catch (_) {
        // Refresh failed — force logout
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
