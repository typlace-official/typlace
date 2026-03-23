module.exports = {
  order: {
    labelKey: "page.categories.order",

    roles: {
      buyer: [
        "page.topics.seller_not_complete",
        "page.topics.wrong_item",
        "page.topics.cancel_order",
        "page.topics.other"
      ],

      seller: [
        "page.topics.buyer_not_confirm",
        "page.topics.delivery_problem",
        "page.topics.other"
      ]
    }
  },

  finance: {
    labelKey: "page.categories.finance",
    topics: [
      "page.topics.deposit_problem",
      "page.topics.withdraw_problem",
      "page.topics.payment_failed",
      "page.topics.other"
    ]
  },

  account: {
    labelKey: "page.categories.account",
    topics: [
      "page.topics.account_hacked",
      "page.topics.restore_access",
      "page.topics.appeal_ban",
      "page.topics.other"
    ]
  },

  report: {
    labelKey: "page.categories.report",
    topics: [
      "page.topics.rule_violation",
      "page.topics.scam",
      "page.topics.insults",
      "page.topics.spam",
      "page.topics.other"
    ]
  },

  report_offer: {
    labelKey: "page.categories.report_offer",
    topics: [
      "page.topics.fake_description",
      "page.topics.wrong_category",
      "page.topics.prohibited_item",
      "page.topics.price_manipulation",
      "page.topics.other"
    ]
  },

  bug: {
    labelKey: "page.categories.bug",
    topics: [
      "page.topics.page_bug",
      "page.topics.chat_bug",
      "page.topics.filters_bug",
      "page.topics.other"
    ]
  },

  other: {
    labelKey: "page.categories.other",
    topics: [
      "page.topics.general_question",
      "page.topics.site_suggestion",
      "page.topics.not_in_list"
    ]
  }
};