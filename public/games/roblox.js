window.GAMES = window.GAMES || {};

window.GAMES.roblox = {
  title: "Roblox",
  icon: "/img/games/roblox.png",
  defaultMode: "robux",

  offerLanguages: {
    requiredByInterface: {
      ru: ["ru", "uk"],
      uk: ["uk", "ru"],
      en: ["en"]
    }
  },

  modes: {
    robux: {
      labelKey: "roblox.modes.robux",
      description: false,
      titleParts: ["method", "amount", "country"],

      filters: {
        method: {
          type: "select",
          labelKey: "roblox.robux.method.label",
          options: [
            { value: "gamepass", labelKey: "roblox.robux.method.gamepass" },
            { value: "private_server", labelKey: "roblox.robux.method.private_server" },
            { value: "official_store", labelKey: "roblox.robux.method.official_store" },
            { value: "gift_card", labelKey: "roblox.robux.method.gift_card" },
            { value: "premium", labelKey: "roblox.robux.method.premium" }
          ]
        },

        amount_range: {
          type: "range",
          labelKey: "roblox.robux.amount",
          showIf: {
            method: ["gamepass", "private_server"]
          },
          showIfValue: {
            amount_official: "other",
            amount_giftcard: "other"
          }
        },

        amount_exact: {
          type: "number",
          labelKey: "roblox.robux.amount",
          showIf: {
            method: ["gamepass", "private_server"]
          },
          showIfValue: {
            amount_official: "other",
            amount_giftcard: "other"
          }
        },

        amount_official: {
          type: "select",
          labelKey: "roblox.robux.amount",
          options: [
            40, 80,
            200, 400, 500,
            800, 1000,
            1200, 1700,
            2000, 2100,
            2500, 3600,
            4500, 10000,
            22500,
            { value: "other", labelKey: "common.other_amount" }
          ],
          showIf: {
            method: "official_store"
          }
        },

        amount_giftcard: {
          type: "select",
          labelKey: "roblox.robux.amount",
          options: [
            100, 200, 300, 400, 450, 500,
            600, 800,
            1000, 1200, 1400, 1700,
            2000, 2200, 2400, 2700,
            3200, 3600,
            4000, 4500,
            5000, 6000,
            7000, 10000,
            13000, 22500,
            { value: "other", labelKey: "common.other_amount" }
          ],
          showIf: {
            method: "gift_card"
          }
        },

        country: {
          type: "select",
          labelKey: "roblox.robux.country",
          options: [
            { value: "eu", labelKey: "common.country.eu" },
            { value: "us", labelKey: "common.country.us" },
            { value: "ru", labelKey: "common.country.ru" },
            { value: "ua_cis", labelKey: "common.country.ua_cis" },
            { value: "other", labelKey: "common.country.other" }
          ],
          showIf: {
            method: "gift_card"
          }
        },

        amount_premium: {
          type: "select",
          labelKey: "roblox.robux.premium",
          options: [450, 1000, 2200],
          showIf: {
            method: "premium"
          }
        }
      }
    },

    accounts: {
      labelKey: "roblox.modes.accounts",
      amount: false,
      method: false,
      description: true,
      titleParts: ["title", "accountType", "accountRegion", "voiceChat"],

      filters: {
        accountType: {
          type: "select",
          labelKey: "roblox.accounts.type",
          options: [
            { value: "sale", labelKey: "common.sale" },
            { value: "rent", labelKey: "common.rent" }
          ]
        },

        accountRegion: {
          type: "select",
          labelKey: "roblox.accounts.region",
          options: [
            { value: "eu", labelKey: "common.country.eu" },
            { value: "us", labelKey: "common.country.us" },
            { value: "ru", labelKey: "common.country.ru" },
            { value: "ua_cis", labelKey: "common.country.ua_cis" },
            { value: "other", labelKey: "common.country.other_region" }
          ]
        },

        voiceChat: {
          type: "select",
          labelKey: "roblox.accounts.voice",
          options: [
            { value: "yes", labelKey: "common.vc_yes" },
            { value: "no", labelKey: "common.vc_no" }
          ]
        }
      }
    },

    skins: {
      labelKey: "roblox.modes.skins",
      description: true,
      categories: [
        "characters",
        "clothes",
        "accessories",
        "hair",
        "animations",
        "promocodes",
        "other"
      ]
    },

    limiteds: {
      labelKey: "roblox.modes.limiteds",
      amount: true,
      method: false,
      description: true
    },

    steal_brainrot: {
      labelKey: "roblox.modes.steal_brainrot",
      description: true,
      categories: ["currency", "accounts", "items", "services", "vip_server", "gamepass"]
    },

    grow_garden: {
      labelKey: "roblox.modes.grow_garden",
      description: true,
      categories: ["currency", "accounts", "items", "services", "gamepass"]
    },

    blox_fruits: {
      labelKey: "roblox.modes.blox_fruits",
      description: true,
      categories: ["beli", "accounts", "items", "vip_server", "services", "guides", "gamepass"]
    },

    adopt_me: {
      labelKey: "roblox.modes.adopt_me",
      description: true,
      categories: ["bucks", "accounts", "items", "services", "guides"]
    },

    mm2: {
      labelKey: "roblox.modes.mm2",
      description: true,
      categories: ["accounts", "items", "services", "guides"]
    },

    other_modes: {
      labelKey: "roblox.modes.other_modes",
      description: true,
      categories: ["currency", "accounts", "items", "services", "gamepass", "vip_server", "other"]
    }
  }
};