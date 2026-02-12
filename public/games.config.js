function defaultGame(title, icon){
  return {
    title,
    icon,
    defaultMode: "Аккаунты",
    modes: {
  "Робуксы": {
    amount: true,
    method: true,
    description: true
  },
  "Аккаунты": {
    amount: false,
    method: false,
    description: true
  },
  "Limiteds": {
  amount: true,        // ✅ количество (штук)
  method: false,
  description: true    // ✅ значит есть title + description + язык
}
}
  };
}

window.GAMES = {

"roblox": {
  title: "Roblox",
  icon: "/img/roblox.svg",
  defaultMode: "Робуксы",
  modes: {

"Робуксы": {
  description: false,

  filters: {

    // 1️⃣ СПОСОБ
    method: {
      type: "select",
      label: "Способ передачи",
      options: [
        "Game Pass",
        "Приватный сервер",
        "Официальный магазин",
        "Подарочные карты",
        "Премиум"
      ]
    },

    // 2️⃣ ОТ / ДО
    amount_range: {
      type: "range",
      label: "Количество Robux",
      showIf: {
        method: [
          "Game Pass",
          "Приватный сервер"
        ]
      },
      showIfValue: {
        amount_official: "Другое количество",
        amount_giftcard: "Другое количество"
      }
    },

    // 3️⃣ ОФИЦИАЛЬНЫЙ МАГАЗИН
    amount_official: {
      type: "select",
      label: "Количество Robux",
      options: [
        40, 80,
        200, 400, 500,
        800, 1000,
        1200, 1700,
        2000, 2100,
        2500, 3600,
        4500, 10000,
        22500,
        "Другое количество"
      ],
      showIf: {
        method: "Официальный магазин"
      }
    },

    // 4️⃣ ПОДАРОЧНЫЕ КАРТЫ
    amount_giftcard: {
      type: "select",
      label: "Количество Robux",
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
        "Другое количество"
      ],
      showIf: {
        method: "Подарочные карты"
      }
    },

    // 5️⃣ СТРАНА
    country: {
      type: "select",
      label: "Страна",
      options: [
        "Европа",
        "Америка",
        "Россия",
        "Украина + СНГ",
        "Другие страны"
      ],
      showIf: {
        method: "Подарочные карты"
      }
    },

    // 6️⃣ PREMIUM
    amount_premium: {
      type: "select",
      label: "Premium",
      options: [450, 1000, 2200],
      showIf: {
        method: "Премиум"
      }
    }

  }
},

"Аккаунты": {
  amount: false,
  method: false,
  description: true,

  filters: {

    accountType: {
      type: "select",
      label: "Тип аккаунта",
      options: [
        "Продажа",
        "Аренда"
      ]
    },

    accountRegion: {
      type: "select",
      label: "Регион",
      options: [
        "Европа",
        "Америка",
        "Россия",
        "Украина + СНГ",
        "Другие регионы"
      ]
    },

    voiceChat: {
      type: "select",
      label: "Voice Chat",
      options: [
        "Есть VC",
        "Нету VC"
      ]
    }

  }
},
    "Limiteds": {
      amount: true,
      method: false,
      description: true
    },

    "Скины": {
      description: true,
      categories: [
        "Персонажи",
        "Одежда",
        "Аксессуары",
        "Прически",
        "Анимации",
        "Промокоды",
        "Прочее"
      ]
    },

    "Studio": {
      description: true,
      categories: [
        "Карта",
        "Модель",
        "Игра",
        "Мод",
        "Услуги",
        "Прочее"
      ]
    },

    "99 Nights in the forest": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "All Star Tower Defense X": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Anime Adventures": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Скины","Gamepass","Прочее"]
    },

    "Anime Crusaders": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Anime Defenders": {
      description: true,
      categories: ["Валюта","Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Anime Last Stand": {
      description: true,
      categories: ["Аккаунты","Предметы","Скины","Услуги","Гайды","Gamepass"]
    },

    "Anime Reborn": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Anime Vanguards": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Arise Crossover": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Arm Wrestle Simulator": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Gamepass"]
    },

    "A S TD": {
      description: true,
      categories: ["Гемы","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Bee Swarm Simulator": {
      description: true,
      categories: ["Стикеры","Аккаунты","Предметы","Услуги","Скины","Гайды"]
    },

    "Attack on Titan Revolution": {
      description: true,
      categories: ["Валюта","Аккаунты","Предметы","Услуги","Гайды"]
    },

    "AUT": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Basketball Zero": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "MM2": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Adopt Me": {
      description: true,
      categories: ["Баксы","Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Blox Fruits": {
      description: true,
      categories: ["Бели","Аккаунты","Предметы","VIP-сервер","Услуги","Гайды","Gamepass"]
    },

    "Bubble Gum Simulator Infinity": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Blade Ball": {
      description: true,
      categories: ["Монеты","Аккаунты","Предметы","Услуги","Gamepass"]
    },

    "Creatures of Sonaria": {
      description: true,
      categories: ["Mushrooms","Аккаунты","Предметы","Услуги","Скины","Гайды"]
    },

    "Blue Lock Rivals": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Counter Blox": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Death Ball": {
      description: true,
      categories: ["Гемы","Аккаунты","Предметы","Услуги","Скины","Гайды"]
    },

    "Criminality": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Скины","Gamepass"]
    },

    "Da Hood": {
      description: true,
      categories: ["Cash","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Five Nights TD": {
      description: true,
      categories: ["Души","Аккаунты","Предметы","Услуги","Скины","Гайды","Промокоды"]
    },

    "Deepwoken": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Fisch": {
      description: true,
      categories: ["C$","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Fish it": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "GPO": {
      description: true,
      categories: ["Peli","Аккаунты","Скины","Предметы","Услуги","Гайды","Bounty"]
    },

    "Forsaken": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Garden Tower Defense": {
      description: true,
      categories: ["Семена","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Ghoul Re": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Jailbreak": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды"]
    },

    "Rivals": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Скины","Гайды","Наборы","Gamepass"]
    },

    "Spongebob Tower Defense": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "The Wild West": {
      description: true,
      categories: ["Золото","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Untitled Boxing Game": {
      description: true,
      categories: ["Cash","Spins","Crates","Аккаунты","Предметы","Услуги","Скины","Гайды"]
    },

    "Type Soul": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "War Tycoon": {
      description: true,
      categories: ["Медали","Аккаунты","Предметы","Услуги","Гайды","Gamepass","VIP-сервер"]
    },

    "Tower Defense Simulator": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Volleyball Legends": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "The Strongest Battlegrounds": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Приватный сервер","Gamepass"]
    },

    "The Forge": {
      description: true,
      categories: ["Аккаунты","Предметы","VIP-сервер","Услуги","Гайды","Gamepass"]
    },

    "Toilet Tower Defense": {
      description: true,
      categories: ["Гемы","Монеты","Ящики","Аккаунты","Предметы","Услуги","Gamepass"]
    },

    "Steal a Brainrot": {
      description: true,
      categories: ["Валюта","Аккаунты","Предметы","Услуги","VIP-сервер","Gamepass"]
    },

    "Rune Slayer": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Plants vs Brainrots": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "My Singing Brainrot": {
      description: true,
      categories: ["Валюта","Аккаунты","Предметы","Услуги","Гайды","VIP-сервер","Gamepass"]
    },

    "Jujutsu Infinite": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Гайды","Сундуки","Gamepass"]
    },

    "Sakura Stand": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Скины","Гайды"]
    },

    "Rebirth Champions: Ultimate": {
      description: true,
      categories: ["Токены","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Project Slayers": {
      description: true,
      categories: ["Аккаунты","Предметы","VIP-сервер","Услуги","Гайды"]
    },

    "Ink Game": {
      description: true,
      categories: ["WON","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Grow a Garden": {
      description: true,
      categories: ["Шекели","Аккаунты","Предметы","Услуги","Gamepass"]
    },

    "Jujutsu Shenanigans": {
      description: true,
      categories: ["Аккаунты","Предметы","Услуги","Gamepass"]
    },

    "NFT Battles": {
      description: true,
      categories: ["Валюта","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Dead Rails": {
      description: true,
      categories: ["Поезда","Аккаунты","Предметы","Услуги","Гайды","Gamepass"]
    },

    "Другие режимы": {
      description: true,
      categories: ["Игровая валюта","Аккаунты","Предметы","Скины","Услуги","Gamepass","VIP-сервер","Коды","Гайды","Прочее"]
    }
  }
},

  // ================= ВСЕ ОСТАЛЬНЫЕ (ШАБЛОН) =================
"app-store": {
  title: "App Store",
  icon: "/img/games/app-store.png",
  defaultMode: "Подарочные карты",
  modes: {
    "Подарочные карты": {
      amount: true,      // номиналы / количество карт
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"gta-5-online": {
  title: "GTA 5 Online",
  icon: "/img/games/gta-5-online.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи / коды
      method: false,
      description: true
    },
    "Деньги": {
      amount: true,      // GTA$
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

  "standoff-2": {
  title: "Standoff 2",
  icon: "/img/games/standoff-2.png",
  defaultMode: "Золото",
  modes: {
    "Золото": {
      amount: true,     // количество валюты
      method: false,
      description: true
    },

    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },

    "Предметы": {
      amount: true,     // количество предметов
      method: false,
      description: true
    },

    "Буст": {
      amount: false,    // количество не нужно (ранг, задачи и т.д.)
      method: false,
      description: true
    },

    "Кланы": {
      amount: false,
      method: false,
      description: true
    },

    "Услуги": {
      amount: false,
      method: false,
      description: true
    },

    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
youtube: {
  title: "YouTube",
  icon: "/img/games/youtube.png",
  defaultMode: "Услуги",

  modes: {
    "Premium": {
      extraFields: {
        premiumType: {
          type: "select",
          label: "Тип подписки",
          options: ["Индивидуальная", "Семейная", "Студенческая"]
        },
        duration: {
          type: "select",
          label: "Срок",
          options: ["1 месяц", "12 месяцев"]
        },
        subscription: {
          type: "select",
          label: "Тип сервиса",
          options: ["YouTube Premium", "Music Premium"]
        }
      }
    },

"Каналы": {
  extraFields: {
    subscribers: {
      type: "number",
      label: "Количество подписчиков"
    },
    topic: {
      type: "select",
      label: "Тематика",
      options: [
        "Новости и политика",
        "Красота и мода",
        "Юмор",
        "Спорт",
        "Музыка",
        "Технологии",
        "Видеоигры",
        "Кулинария и здоровье",
        "Фильмы и развлечения",
        "Без тематики"
      ]
    }
  }
},

    "Услуги": {
      extraFields: {
        serviceType: {
          type: "select",
          label: "Тип услуги",
          options: [
            "Просмотры",
            "Лайки",
            "Подписчики",
            "Зрители",
            "Комментарии",
            "Дизайн",
            "Прочее"
          ]
        }
      }
    },

    "Прочее": {}
  }
},

"tiktok": {
  title: "TikTok",
  icon: "/img/games/tiktok.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Монеты": {
      amount: true,      // количество монет
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"pubg": {
  title: "PUBG",
  icon: "/img/games/pubg.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true,
      filters: {
        platform: {
          type: "select",
          label: "Платформа",
          options: ["PC", "PS", "Xbox"]
        },
        battlegroundsPlus: {
          type: "select",
          label: "BATTLEGROUNDS Plus",
          options: ["Есть", "Нет"]
        }
      }
    },

    "Предметы": {
      amount: false,
      method: false,
      description: true,
      filters: {
        platform: {
          type: "select",
          label: "Платформа",
          options: ["PC", "PS", "Xbox"]
        },
        subcategory: {
          type: "select",
          label: "Категория",
          options: ["Battlegrounds Plus", "Survivor Pass", "Предметы", "Прочее"]
        }
      }
    },

    "G-Coins": {
      amount: false,
      method: false,
      description: true,
      filters: {
        platform: {
          type: "select",
          label: "Платформа",
          options: ["PC", "PS", "Xbox"]
        },
        receiveMethod: {
          type: "select",
          label: "Способ получения",
          options: ["Ключ активации", "С заходом на аккаунт"]
        }
      }
    },

    "Услуги": {
      amount: false,
      method: false,
      description: true,
      filters: {
        platform: {
          type: "select",
          label: "Платформа",
          options: ["PC", "PS", "Xbox"]
        }
      }
    },

    "Прочее": {
      amount: false,
      method: false,
      description: true,
      filters: {
        platform: {
          type: "select",
          label: "Платформа",
          options: ["PC", "PS", "Xbox"]
        }
      }
    }
  }
},

"steam": {
  title: "Steam",
  icon: "/img/games/steam.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Пополнение": {
      amount: true,      // сумма / баланс
      method: false,
      description: true
    },
    "Подарки": {
      amount: true,      // количество подарков
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"xbox": {
  title: "Xbox",
  icon: "/img/games/xbox.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Пополнение баланса": {
      amount: true,      // сумма пополнения
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"valorant": {
  title: "Valorant",
  icon: "/img/games/valorant.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Points": {
      amount: true,      // количество VP
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / задания
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,     // услуга
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"war-thunder": {
  title: "War Thunder",
  icon: "/img/games/war-thunder.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Фарм серебра": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,     // уровни / техника
      method: false,
      description: true
    },
    "Бонус-коды": {
      amount: true,      // количество кодов
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"world-of-warcraft": {
  title: "World of Warcraft",
  icon: "/img/games/world-of-warcraft.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Золото": {
      amount: true,      // количество золота
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // услуги / буст / рейды
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"minecraft": {
  title: "Minecraft",
  icon: "/img/games/minecraft.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Minecoins": {
      amount: true,
      method: false,
      description: true
    },
    "Валюта": {
      amount: true,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Гайды": {
      amount: false,
      method: false,
      description: true
    },
    "Ресурс-паки": {
      amount: true,
      method: false,
      description: true
    },
    "Конфиги": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"rust": {
  title: "Rust",
  icon: "/img/games/rust.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Монеты": {
      amount: true,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "VIP пропуск": {
      amount: true,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: true,
      method: false,
      description: true
    },
    "Kick Drops": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"pubg-mobile": {
  title: "PUBG Mobile",
  icon: "/img/games/pubg-mobile.png",
  defaultMode: "Аккаунты",
  modes: {
"Аккаунты": {
  amount: false,
  method: false,
  description: true,

  filters: {
    offerType: {
      type: "select",
      label: "Тип предложения",
      options: [
        "Продажа",
        "Аренда"
      ]
    },

    level: {
      type: "range",
      label: "Уровень"
    },

    rank: {
      type: "select",
      label: "Ранг",
      options: [
        "Бронза",
        "Серебро",
        "Золото",
        "Платина",
        "Алмаз",
        "Корона",
        "Ас",
        "Завоеватель"
      ]
    },

    mythicSkins: {
      type: "select",
      label: "Мифик скины",
      options: [
        "Нет",
        "1–9",
        "10+",
        "20+",
        "30+",
        "50+",
        "70+",
        "100+"
      ]
    },

    upgradableWeapons: {
      type: "select",
      label: "Прокачиваемые оружия",
      options: [
        "Нет",
        "1–9",
        "10+",
        "20+",
        "30+",
        "40+",
        "50+"
      ]
    },

    killChats: {
      type: "select",
      label: "Килл чаты",
      options: [
        "Нет",
        "1–4",
        "5+",
        "10+",
        "20+"
      ]
    },

    sportCars: {
      type: "select",
      label: "Спорт кары",
      options: [
        "Нет",
        "1–5",
        "6–9",
        "10+"
      ]
    }
  }
},
"Популярность": {
  amount: true,      // очки популярности
  method: false,
  description: true,

  filters: {
    popularityType: {
      type: "select",
      label: "Тип популярности",
      options: [
        "Персональная популярность",
        "Популярность для дома"
      ]
    }
  }
},
"UC": {
  amount: false,
  method: false,
  description: true,
  filters: {
    uc: {
      type: "select",
      label: "Количество UC",
      options: [
        "60",
        "180",
        "325",
        "660",
        "1800",
        "3850",
        "8100",
        "Другое количество"
      ]
    },
    uc_range: {
      type: "range",
      label: "Количество UC",
      showIf: {
        uc: "Другое количество"
      }
    }
  }
},
"Донат": {
  description: true,
  amount: true,
  filters: {
    category: {
      type: "select",
      label: "Категория",
      options: [
        "Пропуск",
        "Подписка",
        "Наборы",
        "Прочее"
      ]
    },
    topupMethod: {
      type: "select",
      label: "Способ пополнения",
      options: [
        "Пополнение по ID",
        "Пополнение кодом",
        "Передача аккаунта"
      ]
    }
  }
},
"Буст": {
  amount: false,
  method: false,
  description: true,

  filters: {
    boostType: {
      type: "select",
      label: "Тип",
      options: [
        "Соло",
        "Дуо",
        "Отряд"
      ]
    },

    boostRange: {
      type: "select",
      label: "Диапазон",
      options: [
        "Бронза – Серебро",
        "Серебро – Золото",
        "Золото – Платина",
        "Платина – Алмаз",
        "Алмаз – Корона",
        "Корона – Ас",
        "Ас – Ас-мастер",
        "Ас-мастер – Ас-доминатор",
        "Ас-доминатор – Завоеватель"
      ]
    },

    boostRegion: {
      type: "select",
      label: "Регион",
      options: [
        "Северная Америка",
        "Европа",
        "Азия",
        "Южная Америка",
        "Ближний Восток",
        "Корея и Япония"
      ]
    }
  }
},

"Достижения": {
  amount: false,
  method: false,
  description: true,

  filters: {
    achievementType: {
      type: "select",
      label: "Тип достижений",
      options: [
        "Все",
        "Великолепные моменты",
        "Матчи",
        "Честь",
        "Прогресс",
        "Знакомства",
        "Общие"
      ]
    }
  }
},

"Metro Royale": {
  amount: false,
  method: false,
  description: true,

  filters: {
    metroType: {
      type: "select",
      label: "Тип предложения",
      options: [
        "Предметы",
        "Сопровождение",
        "Услуги",
        "Прочее"
      ]
    }
  }
},
"Прочее": {
  amount: false,
  method: false,
  description: true,

  filters: {
    otherType: {
      type: "select",
      label: "Тип предложения",
      options: [
        "Раскладка",
        "Чувствительность",
        "Клан",
        "Прочее"
          ]
        }
      }
    }

  }
},

"albion-online": {
  title: "Albion Online",
  icon: "/img/games/albion-online.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Серебро": {
      amount: true,      // количество серебра
      method: false,
      description: true
    },
    "Золото": {
      amount: true,      // количество золота
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / сумма
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"arma-reforger": {
  title: "Arma Reforger",
  icon: "/img/games/arma-reforger.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // настройка, установка модов и т.д.
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"arma-3": {
  title: "Arma 3",
  icon: "/img/games/arma-3.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"apex-legends": {
  title: "Apex Legends",
  icon: "/img/games/apex-legends.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Монеты": {
      amount: true,      // Apex Coins
      method: false,
      description: true
    },
    "Достижения": {
      amount: false,
      method: false,
      description: true
    },
    "Экзотические осколки": {
      amount: true,      // количество шардов
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // сумма / пакеты
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / задачи
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"ark-survival-evolved": {
  title: "ARK: Survival Evolved",
  icon: "/img/games/ark-survival-evolved.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи активации
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // настройка серверов, помощь, переносы и т.д.
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"ark-survival-ascended": {
  title: "ARK: Survival Ascended",
  icon: "/img/games/ark-survival-ascended.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи активации
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // настройка серверов, помощь, переносы
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    }
  }
},
"battlefield": {
  title: "Battlefield",
  icon: "/img/games/battlefield.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Валюта": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"brawl-stars": {
  title: "Brawl Stars",
  icon: "/img/games/brawl-stars.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Гемы": {
      amount: true,      // количество гемов
      method: false,
      description: true
    },
    "Brawl Pass": {
      amount: true,      // сезоны / коды
      method: false,
      description: true
    },
    "Pro Pass": {
      amount: true,      // сезоны / коды
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // сумма / пакеты
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / трофеи
      method: false,
      description: true
    },
    "Квесты": {
      amount: false,     // выполнение задач
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"bodycam": {
  title: "Bodycam",
  icon: "/img/games/bodycam.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // услуги / помощь / настройка
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"battle-net": {
  title: "Battle.net",
  icon: "/img/games/battle-net.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Пополнение баланса": {
      amount: true,      // сумма пополнения
      method: false,
      description: true
    },
    "Смена региона": {
      amount: false,     // услуга
      method: false,
      description: true
    },
    "Тайм карты": {
      amount: true,      // месяцы / дни
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"black-desert": {
  title: "Black Desert",
  icon: "/img/games/black-desert.png",
  defaultMode: "Серебро",
  modes: {
    "Серебро": {
      amount: true,      // количество серебра
      method: false,
      description: true
    },
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Acoin": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,     // уровни / усиление
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"blade-and-soul": {
  title: "Blade & Soul",
  icon: "/img/games/blade-and-soul.png",
  defaultMode: "Золото",
  modes: {
    "Золото": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // прокачка, помощь, фарм
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"dota-2": {
  title: "Dota 2",
  icon: "/img/games/dota-2.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Привязки VHS": {
      amount: false,     // привязка / отвязка
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Буст MMR": {
      amount: false,     // услуга
      method: false,
      description: true
    },
    "Калибровка": {
      amount: false,     // услуга
      method: false,
      description: true
    },
    "Monster Hunter": {
      amount: false,     // режим / услуга
      method: false,
      description: true
    },
    "Отмыв ЛП": {
      amount: false,     // услуга
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,     // коучинг
      method: false,
      description: true
    },
    "Услуги Dota+": {
      amount: false,     // подписка / услуги
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"dayz": {
  title: "DayZ",
  icon: "/img/games/dayz.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "VIP пропуск": {
      amount: true,     // дни / месяцы
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"call-of-duty": {
  title: "Call of Duty",
  icon: "/img/games/call-of-duty.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"chatgpt": {
  title: "ChatGPT",
  icon: "/img/games/chatgpt.png",
  defaultMode: "Подписка",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,     // месяцы
      method: false,
      description: true
    },
    "Sora": {
      amount: true,     // доступ / месяцы
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"capcut": {
  title: "CapCut",
  icon: "/img/games/capcut.png",
  defaultMode: "Подписка",
  modes: {
    "Подписка": {
      amount: true,     // месяцы
      method: false,
      description: true
    },
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"counter-strike-2": {
  title: "Counter-Strike 2",
  icon: "/img/games/counter-strike-2.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "FACEIT Premium": {
      amount: true,      // месяцы
      method: false,
      description: true
    },
    "Скины": {
      amount: true,      // количество скинов
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / elo
      method: false,
      description: true
    },
    "Prime": {
      amount: true,      // ключ / активация
      method: false,
      description: true
    },
    "Арсенал": {
      amount: true,      // предметы / кейсы
      method: false,
      description: true
    },
    "Кейсы": {
      amount: true,      // количество кейсов
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"clash-royale": {
  title: "Clash Royale",
  icon: "/img/games/clash-royale.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Гемы": {
      amount: true,      // количество гемов
      method: false,
      description: true
    },
    "Pass Royale": {
      amount: true,      // сезоны / месяцы
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / сумма
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // трофеи / арена
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // карты / сундуки
      method: false,
      description: true
    },
    "Merge Tactics": {
      amount: false,     // режим / услуги
      method: false,
      description: true
    },
    "Кланы": {
      amount: false,     // клан = 1 объект
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"clash-of-clans": {
  title: "Clash of Clans",
  icon: "/img/games/clash-of-clans.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Гемы": {
      amount: true,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Кланы": {
      amount: false,
      method: false,
      description: true
    },
    "Gold Pass": {
      amount: true,   // месяцы / сезоны
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Золото столицы": {
      amount: true,
      method: false,
      description: true
    },
    "Расстановка базы": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"call-of-duty-warzone": {
  title: "Call of Duty: Warzone",
  icon: "/img/games/call-of-duty-warzone.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "CP": {
      amount: true,   // Call of Duty Points
      method: false,
      description: true
    },
    "Скины": {
      amount: true,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"discord": {
  title: "Discord",
  icon: "/img/games/discord.png",
  defaultMode: "Серверы",
  modes: {
    "Серверы": {
      amount: false,     // сервер = 1 объект
      method: false,
      description: true
    },
    "Украшения": {
      amount: true,      // аватары, баннеры, паки
      method: false,
      description: true
    },
    "Буст сервера": {
      amount: true,      // количество бустов / месяцев
      method: false,
      description: true
    },
    "Nitro": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"dead-by-daylight": {
  title: "Dead by Daylight",
  icon: "/img/games/dead-by-daylight.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Золотые клетки": {
      amount: true,      // валюта (Auric Cells)
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: true,
      method: false,
      description: true
    },
    "Prime Gaming": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"diablo-4": {
  title: "Diablo IV",
  icon: "/img/games/diablo-4.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Золото": {
      amount: true,      // количество золота
      method: false,
      description: true
    },
    "Платина": {
      amount: true,      // количество платины
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи / активации
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Донат": {
      amount: false,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,     // уровни / сезоны
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Билды": {
      amount: false,     // гайды / сборки
      method: false,
      description: true
    },
    "Яма": {
      amount: false,     // runs / carry
      method: false,
      description: true
    },
    "Кошмарные подземелья": {
      amount: false,     // runs / carry
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Vessel of Hatred": {
      amount: false,     // DLC / доступ
      method: false,
      description: true
    },
    "Lord of Hatred": {
      amount: false,     // контент / активности
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"diablo-2-resurrected": {
  title: "Diablo II: Resurrected",
  icon: "/img/games/diablo-2-resurrected.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Руны": {
      amount: true,      // количество рун
      method: false,
      description: true
    },
    "Золото": {
      amount: true,      // количество золота
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи / активации
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"epic-games": {
  title: "Epic Games",
  icon: "/img/games/epic-games.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Пополнение баланса": {
      amount: true,      // сумма пополнения
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: true,      // количество активаций
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"fortnite": {
  title: "Fortnite",
  icon: "/img/games/fortnite.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "В-баксы": {
      amount: true,      // количество V-Bucks
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / суммы
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // уровни / задачи
      method: false,
      description: true
    },
    "PvE": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"free-fire": {
  title: "Free Fire",
  icon: "/img/games/free-fire.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Алмазы": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / суммы
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / задания
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"ea-app": {
  title: "EA App",
  icon: "/img/games/ea-app.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Пополнение баланса": {
      amount: true,      // сумма пополнения
      method: false,
      description: true
    },
    "Подписка EA Play": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: true,      // количество активаций
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"stumble-guys": {
  title: "Stumble Guys",
  icon: "/img/games/stumble-guys.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Гемы": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / суммы
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // уровни / задания
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"google-play": {
  title: "Google Play",
  icon: "/img/games/google-play.png",
  defaultMode: "Gift Cards",
  modes: {
    "Gift Cards": {
      amount: true,      // номиналы / количество карт
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,      // месяцы / периоды
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
telegram: {
  title: "Telegram",
  icon: "/img/games/telegram.png",
  defaultMode: "Каналы",

  modes: {

    // ===== КАНАЛЫ =====
    "Каналы": {
      amount: false,
      description: true,

      filters: {
        topic: {
          type: "select",
          label: "Тематика",
          options: [
            "Автомобили",
            "Бизнес",
            "Еда",
            "Животные",
            "Знакомства и общение",
            "Игры",
            "Кино",
            "Компьютеры",
            "Культура",
            "Мебель",
            "Медицина",
            "Мода и красота",
            "Музыка",
            "Наука и технологии",
            "Недвижимость",
            "Обучение",
            "Отдых и путешествия",
            "Политика",
            "Природа",
            "Производство",
            "Психология",
            "Работа",
            "Развлечения",
            "Реклама",
            "Религия",
            "Связь",
            "Семья",
            "СМИ",
            "Спорт",
            "Строительство и ремонт",
            "Техника",
            "Торговля",
            "Туризм",
            "Финансы",
            "Юмор"
          ]
        },

        subscribers: {
          type: "range",
          label: "Количество подписчиков"
        }
      }
    },

// ===== ЗВЁЗДЫ =====
"Звёзды": {
  amount: true,
  description: true,

  filters: {

    // Основной выбор количества
    starsAmount: {
      type: "select",
      label: "Количество звёзд",
      options: [
        "Все",
        "13",
        "21",
        "43",
        "50",
        "75",
        "85",
        "100",
        "150",
        "200",
        "250",
        "300",
        "350",
        "500",
        "1000",
        "2500",
        "Другое количество"
      ]
    },

    // От / До — ТОЛЬКО если выбрано "Другое количество"
    starsRange: {
      type: "range",
      label: "Количество звёзд",
      showIf: {
        starsAmount: "Другое количество"
      }
    },

    // Способ получения
    receiveMethod: {
      type: "select",
      label: "Способ получения",
      options: [
        "По username",
        "Подарком",
        "С заходом на аккаунт"
      ]
    }

  }
},


    // ===== ПОДАРКИ =====
    "Подарки": {
      amount: true,
      description: true,

      filters: {
        giftType: {
          type: "select",
          label: "Тип подарка",
          options: [
            "8 марта",
            "Алмаз",
            "Амулет",
            "Банка",
            "Бенгальские огни",
            "Бицепс",
            "Блокнот",
            "Бокал",
            "Браслет",
            "Варежки",
            "Венок",
            "Вуду",
            "Гаджет",
            "Галстук",
            "Глаз",
            "Гриб",
            "Губы",
            "Духи",
            "Жаба",
            "Желе",
            "Звезда",
            "Зелье",
            "Змея",
            "Календарь",
            "Кепка",
            "Кирпич",
            "Клевер",
            "Клубника",
            "Кнопка",
            "Колокольчик",
            "Колпак",
            "Кольцо",
            "Корзина",
            "Мороженое",
            "Роза",
            "Свеча",
            "Сердце",
            "Торт",
            "Шар",
            "Прочее"
          ]
        },

        dealType: {
          type: "tabs",
          label: "Тип предложения",
          options: ["Все", "Продажа", "Аренда"]
        }
      }
    },

    // ===== УСЛУГИ =====
    "Услуги": {
      amount: false,
      description: true,

      filters: {
        serviceType: {
          type: "select",
          label: "Тип услуги",
          options: [
            "Реакции",
            "Просмотры",
            "Подписчики",
            "Репосты",
            "Комментарии",
            "Голоса",
            "Реклама",
            "Дизайн",
            "Буст"
          ]
        }
      }
    },

    // ===== PREMIUM =====
    "Premium": {
      amount: true,
      description: true,

      filters: {
        period: {
          type: "select",
          label: "Срок",
          options: [
            "1 месяц",
            "3 месяца",
            "6 месяцев",
            "12 месяцев",
            "24 месяца"
          ]
        },

        receiveMethod: {
          type: "select",
          label: "Способ получения",
          options: [
            "Подарком",
            "Подарочной ссылкой",
            "С заходом на аккаунт",
            "Без захода на аккаунт"
          ]
        }
      }
    },

    // ===== ЮЗЕРНЕЙМЫ =====
    "Юзернеймы": {
      amount: false,
      description: true
    },

// ===== СТИКЕРЫ =====
"Стикеры": {
  amount: false,
  description: true,

  filters: {
    collection: {
      type: "select",
      label: "Коллекция",
      options: [
        "Baseball Cap",
        "Blue Pengu",
        "Bodyguard",
        "Bored Ape Originals",
        "Bow Tie",
        "CNY 2092",
        "Cook",
        "Cool Blue Pengu",
        "Duck",
        "Extra Eyes",
        "Flags",
        "Freedom",
        "Frog Hat",
        "Full dig",
        "GMI",
        "Gold bone",
        "Hello Kitty",
        "Hypnotist",
        "Ice Cream",
        "Jester",
        "King",
        "Moonbirds Originals",
        "Newsboy Cap",
        "NGMI",
        "Noodles",
        "Not Memes",
        "OG Icons",
        "One Piece Sanji",
        "One Piece Zoro",
        "Orange Hat",
        "Pengu CNY",
        "Pengu Valentines",
        "Pengu x Baby Shark",
        "Pengu x NASCAR",
        "Pilot",
        "PUCCA Moods",
        "Raizan",
        "Red Rex Pack",
        "Santa Dogs",
        "Shaggy",
        "Shao",
        "Sheikh",
        "Silver bone",
        "Sloth Capital",
        "Smile",
        "Strawberry Hat",
        "Teletubby",
        "Termidogtor",
        "Van Dogh",
        "Viking",
        "Witch",
        "Другая коллекция",
        "Офчейн стикеры"
      ]
    }
  }
},

  "Прочее": {
      amount: false,
      description: true,
      filters: {
        offerType: {
          type: "select",
          label: "Тип предложения",
          options: [
            "Аватарки",
            "Гайды",
            "Группы",
            "Теги",
            "Стикеры",
            "Прочее"
          ]
        }
      }
    }

  }
},

"spotify": {
  title: "Spotify",
  icon: "/img/games/spotify.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Premium": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Подарочные карты": {
      amount: true,      // номинал / количество
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"squad": {
  title: "Squad",
  icon: "/img/games/squad.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"twitter-x": {
  title: "Twitter (X)",
  icon: "/img/games/twitter-x.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"twitch": {
  title: "Twitch",
  icon: "/img/games/twitch.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,      // месяцы / количество
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"netflix": {
  title: "Netflix",
  icon: "/img/games/netflix.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,      // месяцы / количество
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"genshin-impact": {
  title: "Genshin Impact",
  icon: "/img/games/genshin-impact.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Кристаллы": {
      amount: true,      // количество Genesis Crystals
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // пакеты / суммы
      method: false,
      description: true
    },
    "Луна": {
      amount: true,      // месяцы Blessing of the Welkin Moon
      method: false,
      description: true
    },
    "Исследование локаций": {
      amount: false,
      method: false,
      description: true
    },
    "Босы и подземелья": {
      amount: false,
      method: false,
      description: true
    },
    "Астральный предел": {
      amount: false,
      method: false,
      description: true
    },
    "Гранулы времени": {
      amount: true,      // количество
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Квесты": {
      amount: false,
      method: false,
      description: true
    },
    "Достижения": {
      amount: false,
      method: false,
      description: true
    },
    "Фарм": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"instagram": {
  title: "Instagram",
  icon: "/img/games/instagram.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"new-world": {
  title: "New World",
  icon: "/img/games/new-world.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Золото": {
      amount: true,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Экспедиции": {
      amount: false,
      method: false,
      description: true
    },
    "Сбор": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"league-of-legends": {
  title: "League of Legends",
  icon: "/img/games/league-of-legends.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Riot Points": {
      amount: true,       // количество RP
      method: false,
      description: true
    },
    "Квалификация": {
      amount: false,      // размещение / ранги
      method: false,
      description: true
    },
    "Донат": {
      amount: true,       // суммы / пакеты
      method: false,
      description: true
    },
    "Буст": {
      amount: false,      // ранги / победы
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Боевой пропуск": {
      amount: true,       // сезоны / уровни
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"rockstar-games": {
  title: "Rockstar Games",
  icon: "/img/games/rockstar-games.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"world-of-tanks": {
  title: "World of Tanks",
  icon: "/img/games/world-of-tanks.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Фарм серебра": {
      amount: true,
      method: false,
      description: true
    },
    "Золото": {
      amount: true,
      method: false,
      description: true
    },
    "Бонус-коды": {
      amount: true,
      method: false,
      description: true
    },
    "Коробки": {
      amount: true,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Выполнение ЛБЗ": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Кланы": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"terraria": {
  title: "Terraria",
  icon: "/img/games/terraria.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"sea-of-thieves": {
  title: "Sea of Thieves",
  icon: "/img/games/sea-of-thieves.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Древние монеты": {
      amount: true,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"valheim": {
  title: "Valheim",
  icon: "/img/games/valheim.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"sons-of-the-forest": {
  title: "Sons of the Forest",
  icon: "/img/games/sons-of-the-forest.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"the-finals": {
  title: "The Finals",
  icon: "/img/games/the-finals.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Мультибаксы": {
      amount: true,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"rainbow-six-siege": {
  title: "Rainbow Six Siege",
  icon: "/img/games/rainbow-six-siege.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Кредиты": {
      amount: true,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"path-of-exile": {
  title: "Path of Exile",
  icon: "/img/games/path-of-exile.png",
  defaultMode: "Божественные сферы",
  modes: {
    "Божественные сферы": {
      amount: true,
      method: false,
      description: true
    },
    "Сферы возвышения": {
      amount: true,
      method: false,
      description: true
    },
    "Сферы хаоса": {
      amount: true,
      method: false,
      description: true
    },
    "Сферы (прочие)": {
      amount: true,
      method: false,
      description: true
    },
    "Зеркала Каландры": {
      amount: true,
      method: false,
      description: true
    },
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Билды": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"project-zomboid": {
  title: "Project Zomboid",
  icon: "/img/games/project-zomboid.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Моды": {
      amount: false,
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"playstation": {
  title: "PlayStation",
  icon: "/img/games/playstation.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Пополнение бумажника": {
      amount: true,      // сумма пополнения
      method: false,
      description: true
    },
    "Plus": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"perfect-world": {
  title: "Perfect World",
  icon: "/img/games/perfect-world.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Юани": {
      amount: true,      // игровая валюта
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"overwatch-2": {
  title: "Overwatch 2",
  icon: "/img/games/overwatch-2.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Монеты": {
      amount: true,      // количество монет
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Жетоны OWL": {
      amount: true,      // количество жетонов
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"once-human": {
  title: "Once Human",
  icon: "/img/games/once-human.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Девианты": {
      amount: true,      // количество девиантов
      method: false,
      description: true
    },
    "Эксионы": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"lost-ark": {
  title: "Lost Ark",
  icon: "/img/games/lost-ark.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Золото": {
      amount: true,      // количество золота
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Prime Gaming": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"lineage-2": {
  title: "Lineage 2",
  icon: "/img/games/lineage-2.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Адена": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"marvel-rivals": {
  title: "Marvel Rivals",
  icon: "/img/games/marvel-rivals.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Кристаллы": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Боевой пропуск": {
      amount: true,      // уровни / пропуск
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Гайды": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"mobile-legends": {
  title: "Mobile Legends",
  icon: "/img/games/mobile-legends.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Алмазы": {
      amount: true,      // количество валюты
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "Подарки": {
      amount: true,      // количество подарков
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"metin2": {
  title: "Metin2",
  icon: "/img/games/metin2.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Янги": {
      amount: true,      // игровая валюта
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"hearthstone": {
  title: "Hearthstone",
  icon: "/img/games/hearthstone.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Рунические камни": {
      amount: true,      // количество камней
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // паки / наборы / валюта
      method: false,
      description: true
    },
    "Буст": {
      amount: false,     // ранги / задания
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,     // коучинг
      method: false,
      description: true
    },
    "Смена региона": {
      amount: false,
      method: false,
      description: true
    },
    "Prime Gaming": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"elden-ring": {
  title: "Elden Ring",
  icon: "/img/games/elden-ring.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    },
    "Руны": {
      amount: true,      // количество рун
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // прокачка, боссы и т.д.
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"final-fantasy-xiv": {
  title: "Final Fantasy XIV",
  icon: "/img/games/final-fantasy-xiv.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,      // количество предметов
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи / дополнения
      method: false,
      description: true
    },
    "Гил": {
      amount: true,      // игровая валюта
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // прокачка, рейды, квесты
      method: false,
      description: true
    }
  }
},
"forza-horizon": {
  title: "Forza Horizon",
  icon: "/img/games/forza-horizon.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Кредиты": {
      amount: true,      // игровая валюта
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,      // ключи / дополнения
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,     // прокачка, помощь, задания
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,      // месяцы / коды
      method: false,
      description: true
    },
    "Онлайн активации": {
      amount: false,
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"heroes-of-the-storm": {
  title: "Heroes of the Storm",
  icon: "/img/games/heroes-of-the-storm.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    }
  }
},

"honkai-star-rail": {
  title: "Honkai: Star Rail",
  icon: "/img/games/honkai-star-rail.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Донат": {
      amount: true,      // кристаллы / пропуски
      method: false,
      description: true
    },
    "Исследование локаций": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Prime Gaming": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"hell-let-loose": {
  title: "Hell Let Loose",
  icon: "/img/games/hell-let-loose.png",
  defaultMode: "Услуги",
  modes: {
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"path-of-exile-2": {
  title: "Path of Exile 2",
  icon: "/img/games/path-of-exile-2.png",
  defaultMode: "Сферы",
  modes: {
    "Сферы": {
      amount: true,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Разлом": {
      amount: false,
      method: false,
      description: true
    },
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Делириум": {
      amount: false,
      method: false,
      description: true
    },
    "Монеты": {
      amount: true,
      method: false,
      description: true
    },
    "Предметы": {
      amount: true,
      method: false,
      description: true
    },
    "Прокачка": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Гайды": {
      amount: false,
      method: false,
      description: true
    },
    "Обучение": {
      amount: false,
      method: false,
      description: true
    },
    "Билды": {
      amount: false,
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    },
    "Зеркала Каландры": {
      amount: true,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"perplexity": {
  title: "Perplexity",
  icon: "/img/games/perplexity.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,      // месяцы / планы
      method: false,
      description: true
    }
  }
},
"gemini": {
  title: "Gemini",
  icon: "/img/games/gemini.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Подписка": {
      amount: true,      // месяцы / планы
      method: false,
      description: true
    }
  }
},
"far-cry": {
  title: "Far Cry",
  icon: "/img/games/far-cry.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "Ключи": {
      amount: true,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Оффлайн активации": {
      amount: false,
      method: false,
      description: true
    },
    "Game Pass": {
      amount: true,     // месяцы / коды
      method: false,
      description: true
    },
    "Twitch Drops": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"call-of-duty-mobile": {
  title: "Call of Duty Mobile",
  icon: "/img/games/call-of-duty-mobile.png",
  defaultMode: "Аккаунты",
  modes: {
    "Аккаунты": {
      amount: false,
      method: false,
      description: true
    },
    "CP": {
      amount: true,      // количество CP
      method: false,
      description: true
    },
    "Донат": {
      amount: true,
      method: false,
      description: true
    },
    "Буст": {
      amount: false,
      method: false,
      description: true
    },
    "DMZ Recon": {
      amount: false,
      method: false,
      description: true
    },
    "Prime Gaming": {
      amount: false,
      method: false,
      description: true
    },
    "Услуги": {
      amount: false,
      method: false,
      description: true
    },
    "Прочее": {
      amount: false,
      method: false,
      description: true
    }
  }
},
"forza-horizon-6": {
  title: "Forza Horizon 6",
  icon: "/img/games/forza-horizon-6.png",
  defaultMode: "Ключи",
  modes: {
    "Ключи": {
      amount: true,      // количество ключей
      method: false,
      description: true
    }
  }
},

};