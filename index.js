"use strict";

// LINEとやり取りするための道具
const line = require("@line/bot-sdk");
// 外部のAPI(銀行など)と通信するための道具
const request = require("request");

// LINEの認証情報(Lambdaの環境変数から取得)
const config = {
  channelAccessToken: process.env.channelAccessTokenLINE,
  channelSecret: process.env.channelSecretLINE,
};

// LINEに返信するためのクライアント
const client = new line.messagingApi.MessagingApiClient(config);

// sunabar(銀行API)のアクセストークン(環境変数から取得)
const sunabarToken = process.env.sunabarToken;

// LINEからメッセージが届いたときに実行される関数
exports.handler = async (event) => {
  // LINEから送られてきたデータを取り出す
  const body = JSON.parse(event.body);

  // 返信先を特定するためのトークン
  const replyToken = body.events[0].replyToken;
  // ユーザーが送ってきた文章
  const reqMessage = body.events[0].message.text;

  // 返信メッセージを入れる変数(最初は空)
  let resMessage = "";

  // 「点」という文字が含まれていたら、テストの点数とみなす
  if (reqMessage.includes("点")) {
    // ★Aさん担当: 点数を取り出して、ボーナス金額を判定する処理

    // ===========================================
    // ★　C 担当: 振込実行処理
    // 「bonusAmount(ボーナス金額)が決まっていたら、sunabarの振込APIを呼び出して、
    //   子どもの口座にお金を送る」という処理です
    // ===========================================

    if (bonusAmount > 0) {
      // 今日の日付を「2026-06-16」のような形式で自動的に作る
      // (sunabarのルールで、振込指定日は「今日以降」でないとエラーになるため)
      const today = new Date().toISOString().split("T")[0];

      // sunabarに送る「お願い状」を組み立てる
      var options = {
        method: "POST", // 「送ってください」というお願いの種類
        url: "https://api.sunabar.gmo-aozora.com/personal/v1/transfer/request", // 銀行の窓口の場所
        headers: {
          Accept: "application/json;charset=UTF-8",
          "Content-Type": "application/json;charset=UTF-8",
          "x-access-token": sunabarToken, // sunabarへの通行証(すでにコード上部で取得済みの変数)
        },
        body: JSON.stringify({
          accountId: parentAccountId,
          // ↑ 💡振込元(親)の口座ID
          // ← 💡最終段階で書き換え必要!Lambdaの環境変数「parentAccountId」に、本物の値を登録すること

          transferDesignatedDate: today, // 振込を実行する日(今日の日付。自動で入るので変更不要)
          transferDateHolidayCode: "1", // 休日の場合の処理方法を指定する固定値(変更不要)
          totalCount: "1", // 何件分の振込か(今回は1件だけなので固定で1)
          totalAmount: bonusAmount.toString(), // 振込の合計金額(Aさんが計算したbonusAmountを使う。変更不要)

          transfers: [
            {
              itemId: "1", // 振込明細の番号(1件だけなので固定で1)
              transferAmount: bonusAmount.toString(), // この明細の振込金額(変更不要)

              beneficiaryBankCode: "0310", // 振込先の銀行コード(GMOあおぞらネット銀行は固定で0310。変更不要)

              beneficiaryBranchCode: childBranchCode,
              // ↑ 💡振込先(子ども)の支店コード
              // ← 💡最終段階で書き換え必要!Lambdaの環境変数「childBranchCode」に、本物の値を登録すること

              accountTypeCode: "1", // 口座の種類(普通預金を意味する固定値。変更不要)

              accountNumber: childAccountNumber,
              // ↑ 💡振込先(子ども)の口座番号
              // ← 💡最終段階で書き換え必要!Lambdaの環境変数「childAccountNumber」に、本物の値を登録すること

              beneficiaryName: childName,
              // ↑ 💡振込先(子ども)の口座名義(カタカナ)
              // ← 💡最終段階で書き換え必要!Lambdaの環境変数「childName」に、本物の値を登録すること
            },
          ],
        }),
      };

      // sunabarに、お願い状(options)を送って、結果が返ってくるまで待つ
      const response = await requestPromise(options);

      // 返ってきた結果(文字列)を、JavaScriptが扱えるオブジェクトに変換する
      const data = JSON.parse(response.body);

      // 返信メッセージを作る(受付番号も一緒に表示する)
      resMessage =
        score +
        "点!ボーナス" +
        bonusAmount +
        "円を即時振込しました(受付番号: " +
        data.applyNo +
        ")";
    }
  } else if (reqMessage === "残高") {
    // ★Bさん担当: sunabarの残高照会APIを呼び出して、残高を返す処理
  }

  // LINEに返信を送る
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: resMessage }],
  });
};
