window.GAMES = window.GAMES || {};

window.GAMES.roblox = {
  title: "Roblox",
  icon: "/img/games/roblox.png",
  defaultMode: "robux",

  modes: {

    robux: {
      labelKey: "roblox.modes.robux",
      description: false,

      filters: {

        method: {
  type: "select",
  labelKey: "roblox.robux.method.label",
  options: [
    { value: "gamepass",       labelKey: "roblox.robux.method.gamepass" },
    { value: "private_server", labelKey: "roblox.robux.method.private_server" },
    { value: "official_store", labelKey: "roblox.robux.method.official_store" },
    { value: "gift_card",      labelKey: "roblox.robux.method.gift_card" },
    { value: "premium",        labelKey: "roblox.robux.method.premium" }
  ]
},

amount_range: {
  type: "range",
  labelKey: "roblox.robux.amount",

  // Показываем для Gamepass и Private Server
  showIf: {
    method: ["gamepass", "private_server"]
  },

  // Показываем если в select выбрали "other"
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

    limiteds: {
      labelKey: "roblox.modes.limiteds",
      amount: true,
      method: false,
      description: true
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

    studio: {
      labelKey: "roblox.modes.studio",
      description: true,
      categories: [
        "map",
        "model",
        "game",
        "mod",
        "services",
        "other"
      ]
    },

    nights_forest: {
      labelKey: "roblox.modes.nights_forest",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    astd_x: {
      labelKey: "roblox.modes.astd_x",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    anime_adventures: {
      labelKey: "roblox.modes.anime_adventures",
      description: true,
      categories: ["accounts","items","services","guides","skins","gamepass","other"]
    },

    anime_crusaders: {
      labelKey: "roblox.modes.anime_crusaders",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    anime_defenders: {
      labelKey: "roblox.modes.anime_defenders",
      description: true,
      categories: ["currency","accounts","items","services","guides"]
    },

    anime_last_stand: {
      labelKey: "roblox.modes.anime_last_stand",
      description: true,
      categories: ["accounts","items","skins","services","guides","gamepass"]
    },

    anime_reborn: {
      labelKey: "roblox.modes.anime_reborn",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    anime_vanguards: {
      labelKey: "roblox.modes.anime_vanguards",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    arise_crossover: {
      labelKey: "roblox.modes.arise_crossover",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    arm_wrestle_sim: {
      labelKey: "roblox.modes.arm_wrestle_sim",
      description: true,
      categories: ["accounts","items","services","gamepass"]
    },

    a_std: {
      labelKey: "roblox.modes.a_std",
      description: true,
      categories: ["gems","accounts","items","services","guides","gamepass"]
    },

    bee_swarm: {
      labelKey: "roblox.modes.bee_swarm",
      description: true,
      categories: ["stickers","accounts","items","services","skins","guides"]
    },

    aot_revolution: {
      labelKey: "roblox.modes.aot_revolution",
      description: true,
      categories: ["currency","accounts","items","services","guides"]
    },

    aut: {
      labelKey: "roblox.modes.aut",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    basketball_zero: {
      labelKey: "roblox.modes.basketball_zero",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    mm2: {
      labelKey: "roblox.modes.mm2",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    adopt_me: {
      labelKey: "roblox.modes.adopt_me",
      description: true,
      categories: ["bucks","accounts","items","services","guides"]
    },

    blox_fruits: {
      labelKey: "roblox.modes.blox_fruits",
      description: true,
      categories: ["beli","accounts","items","vip_server","services","guides","gamepass"]
    },

    bubble_gum_inf: {
      labelKey: "roblox.modes.bubble_gum_inf",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    blade_ball: {
      labelKey: "roblox.modes.blade_ball",
      description: true,
      categories: ["coins","accounts","items","services","gamepass"]
    },

    creatures_sonaria: {
      labelKey: "roblox.modes.creatures_sonaria",
      description: true,
      categories: ["mushrooms","accounts","items","services","skins","guides"]
    },

    blue_lock: {
      labelKey: "roblox.modes.blue_lock",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    counter_blox: {
      labelKey: "roblox.modes.counter_blox",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    death_ball: {
      labelKey: "roblox.modes.death_ball",
      description: true,
      categories: ["gems","accounts","items","services","skins","guides"]
    },

    criminality: {
      labelKey: "roblox.modes.criminality",
      description: true,
      categories: ["accounts","items","services","guides","skins","gamepass"]
    },

    da_hood: {
      labelKey: "roblox.modes.da_hood",
      description: true,
      categories: ["cash","accounts","items","services","guides","gamepass"]
    },

    five_nights_td: {
      labelKey: "roblox.modes.five_nights_td",
      description: true,
      categories: ["souls","accounts","items","services","skins","guides","promocodes"]
        },
        deepwoken: {
      labelKey: "roblox.modes.deepwoken",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    fisch: {
      labelKey: "roblox.modes.fisch",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    fish_it: {
      labelKey: "roblox.modes.fish_it",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    gpo: {
      labelKey: "roblox.modes.gpo",
      description: true,
      categories: ["currency","accounts","skins","items","services","guides","bounty"]
    },

    forsaken: {
      labelKey: "roblox.modes.forsaken",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    garden_td: {
      labelKey: "roblox.modes.garden_td",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    ghoul_re: {
      labelKey: "roblox.modes.ghoul_re",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    jailbreak: {
      labelKey: "roblox.modes.jailbreak",
      description: true,
      categories: ["accounts","items","services","guides"]
    },

    rivals: {
      labelKey: "roblox.modes.rivals",
      description: true,
      categories: ["accounts","items","services","skins","guides","bundles","gamepass"]
    },

    spongebob_td: {
      labelKey: "roblox.modes.spongebob_td",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    wild_west: {
      labelKey: "roblox.modes.wild_west",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    boxing_game: {
      labelKey: "roblox.modes.boxing_game",
      description: true,
      categories: ["cash","spins","crates","accounts","items","services","skins","guides"]
    },

    type_soul: {
      labelKey: "roblox.modes.type_soul",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    war_tycoon: {
      labelKey: "roblox.modes.war_tycoon",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass","vip_server"]
    },

    tds: {
      labelKey: "roblox.modes.tds",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    volleyball_legends: {
      labelKey: "roblox.modes.volleyball_legends",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    strongest_bg: {
      labelKey: "roblox.modes.strongest_bg",
      description: true,
      categories: ["accounts","items","services","guides","vip_server","gamepass"]
    },

    forge: {
      labelKey: "roblox.modes.forge",
      description: true,
      categories: ["accounts","items","vip_server","services","guides","gamepass"]
    },

    toilet_td: {
      labelKey: "roblox.modes.toilet_td",
      description: true,
      categories: ["gems","coins","crates","accounts","items","services","gamepass"]
    },

    steal_brainrot: {
      labelKey: "roblox.modes.steal_brainrot",
      description: true,
      categories: ["currency","accounts","items","services","vip_server","gamepass"]
    },

    rune_slayer: {
      labelKey: "roblox.modes.rune_slayer",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    plants_brainrots: {
      labelKey: "roblox.modes.plants_brainrots",
      description: true,
      categories: ["accounts","items","services","guides","gamepass"]
    },

    singing_brainrot: {
      labelKey: "roblox.modes.singing_brainrot",
      description: true,
      categories: ["currency","accounts","items","services","guides","vip_server","gamepass"]
    },

    jujutsu_infinite: {
      labelKey: "roblox.modes.jujutsu_infinite",
      description: true,
      categories: ["accounts","items","services","guides","crates","gamepass"]
    },

    sakura_stand: {
      labelKey: "roblox.modes.sakura_stand",
      description: true,
      categories: ["accounts","items","services","skins","guides"]
    },

    rebirth_champions: {
      labelKey: "roblox.modes.rebirth_champions",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    project_slayers: {
      labelKey: "roblox.modes.project_slayers",
      description: true,
      categories: ["accounts","items","vip_server","services","guides"]
    },

    ink_game: {
      labelKey: "roblox.modes.ink_game",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    grow_garden: {
      labelKey: "roblox.modes.grow_garden",
      description: true,
      categories: ["currency","accounts","items","services","gamepass"]
    },

    jujutsu_shenanigans: {
      labelKey: "roblox.modes.jujutsu_shenanigans",
      description: true,
      categories: ["accounts","items","services","gamepass"]
    },

    nft_battles: {
      labelKey: "roblox.modes.nft_battles",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    dead_rails: {
      labelKey: "roblox.modes.dead_rails",
      description: true,
      categories: ["currency","accounts","items","services","guides","gamepass"]
    },

    other_modes: {
      labelKey: "roblox.modes.other_modes",
      description: true,
      categories: ["currency","accounts","items","skins","services","gamepass","vip_server","codes","guides","other"]
    }

  }

};