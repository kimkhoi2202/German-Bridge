const siteUrl = process.env.CONVEX_SITE_URL;

if (!siteUrl) {
  throw new Error("Missing CONVEX_SITE_URL for Convex auth configuration");
}

export default {
  providers: [
    {
      domain: siteUrl,
      applicationID: "convex",
    },
  ],
};
