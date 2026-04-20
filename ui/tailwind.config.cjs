module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9e9ff",
          200: "#b9d6ff",
          300: "#8bbcff",
          400: "#5c9fff",
          500: "#327cff",
          600: "#165fe6",
          700: "#134cc2",
          800: "#153f9d",
          900: "#18367e",
        },
      },
      boxShadow: {
        panel: "0 18px 40px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        panel: "1.25rem",
      },
    },
  },
  plugins: [],
};
