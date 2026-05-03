window.GYM_API_URL = window.GYM_API_URL || (
  ["5500", "5501", "5502"].includes(window.location.port)
    ? "http://localhost:3000"
    : ""
);
