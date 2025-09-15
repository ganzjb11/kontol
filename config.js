module.exports = {
  pterodactylConfig: {
    domain: "https://rofiksoleh.cloud-hosting.biz.id",
    apiKey: "ptla_WIO5duQxqL7EfeVAIxaSBQ0vnLXBereXMuLbn5ItvH2",
    eggId: "15",
    nestId: "5",
    locationId: "1",
    // CARA PENULISAN YANG BENAR
    safeUsers: [
        1, 
        2, 
        "admin@g.co", 
        "kyanz@gmail.com"
    ] 
  },
  telegramConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    ownerChatId: process.env.TELEGRAM_OWNER_CHAT_ID
  }
};