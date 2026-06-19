export const API = process.env.NEXT_PUBLIC_API_URL;

export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
      ...options.headers,
    },
  });
};