import axios from "axios";
import { signOut } from "next-auth/react";

const apiUrl = typeof window !== "undefined"
  ? `http://${window.location.hostname}:9000`
  : "http://localhost:9000";

export const api = axios.create({
  baseURL: apiUrl,
  withCredentials: true,
});

api.interceptors.response.use(
  res => res,
  async error => {
    if (error.response?.status === 401) {
      // Session expired / invalid
      await signOut({ callbackUrl: "/auth" });
    }

    return Promise.reject(error);
  }
);
