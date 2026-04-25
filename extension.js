const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let statusBarItem;
let nextReminderTime;
let timerId;
let outputChannel;
let extensionContext;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  extensionContext = context;
  outputChannel = vscode.window.createOutputChannel("Tasbeeh Reminder");
  outputChannel.appendLine('Tasbeeh Reminder v4 is now active!');

  // إنشاء أيقونة شريط الحالة (Status Bar)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'tasbeeh.showMenu';
  context.subscriptions.push(statusBarItem);

  // تسجيل الأوامر
  context.subscriptions.push(vscode.commands.registerCommand('tasbeeh.showNow', showTasbeeh));
  context.subscriptions.push(vscode.commands.registerCommand('tasbeeh.showMenu', showMenu));

  // إظهار رسالة عند البدء
  vscode.window.showInformationMessage('تم تفعيل إضافة "ذكر الله". انظر أسفل يمين الشاشة لرؤية العداد 📿.');

  // بدء العداد
  startTimer();

  // تحديث العداد عند تغيير الإعدادات
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('tasbeeh.interval')) {
      outputChannel.appendLine('تم تغيير الإعدادات، إعادة تشغيل العداد...');
      startTimer();
    }
  });
}

function startTimer() {
  if (timerId) {
    clearInterval(timerId);
  }

  const config = vscode.workspace.getConfiguration('tasbeeh');
  let intervalMinutes = config.get('interval');

  if (intervalMinutes <= 0) {
    statusBarItem.hide();
    return;
  }

  // حساب وقت التنبيه القادم
  setNextReminder(intervalMinutes);
  statusBarItem.show();

  // تحديث العداد كل 10 ثواني لضمان الدقة وتحديث النص
  timerId = setInterval(updateStatusBar, 10000);
  updateStatusBar(); // تحديث فوري للنص
}

function setNextReminder(minutes) {
  const now = new Date();
  nextReminderTime = new Date(now.getTime() + minutes * 60000);
}

function updateStatusBar() {
  if (!nextReminderTime) return;

  const now = new Date();
  const diffMs = nextReminderTime - now;

  // إذا انتهى الوقت
  if (diffMs <= 0) {
    showTasbeeh();
    const config = vscode.workspace.getConfiguration('tasbeeh');
    setNextReminder(config.get('interval'));
  }

  // حساب الدقائق المتبقية لعرضها
  const diffMinutes = Math.ceil((nextReminderTime - new Date()) / 60000);

  // إذا كان المتبقي أقل من دقيقة نكتب <1m
  let displayText = diffMinutes > 0 ? `${diffMinutes}m` : `<1m`;

  // إحضار الورد اليومي
  const config = vscode.workspace.getConfiguration('tasbeeh');
  const goal = config.get('dailyGoal') || 100;
  const currentCount = getDailyCount();

  statusBarItem.text = `📿 ${displayText} | 📈 ${currentCount}/${goal}`;
  statusBarItem.tooltip = "ذكر الله - اضغط هنا للخيارات";
}

function getDailyCount() {
  if (!extensionContext) return 0;
  const today = new Date().toISOString().split('T')[0];
  return extensionContext.globalState.get(`tasbeeh_count_${today}`, 0);
}

function incrementDailyCount() {
  if (!extensionContext) return;
  const today = new Date().toISOString().split('T')[0];
  const count = getDailyCount() + 1;
  extensionContext.globalState.update(`tasbeeh_count_${today}`, count);
  updateStatusBar();
}

function getQuranVerse() {
  try {
    const quranDir = path.join(extensionContext.extensionPath, 'quran_json_files');
    const files = fs.readdirSync(quranDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) return null;

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const filePath = path.join(quranDir, randomFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const verses = Object.keys(content.verse);
    const randomVerseKey = verses[Math.floor(Math.random() * verses.length)];
    const verseText = content.verse[randomVerseKey];
    const verseNumber = randomVerseKey.split('_')[1];

    return `"${verseText}" - سورة ${content.name} (${verseNumber})`;
  } catch (err) {
    outputChannel.appendLine('Error reading Quran files: ' + err.message);
    return null;
  }
}

function getMessages() {
  const config = vscode.workspace.getConfiguration('tasbeeh');
  const category = config.get('category') || "عام (General)";

  if (category.startsWith("استغفار")) {
    return [
      "أستغفر الله العظيم وأتوب إليه",
      "اللهم اغفر لي وارحمني",
      "أستغفر الله الذي لا إله إلا هو الحي القيوم وأتوب إليه",
      "سبحانك اللهم وبحمدك أشهد أن لا إله إلا أنت أستغفرك وأتوب إليك"
    ];
  } else if (category.startsWith("صباح ومساء")) {
    return [
      "بسم الله الذي لا يضر مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم",
      "رضيت بالله رباً وبالإسلام ديناً وبمحمد صلى الله عليه وسلم نبياً",
      "حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم",
      "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور"
    ];
  } else if (category.startsWith("عام")) {
    return [
      "سبحان الله وبحمده، سبحان الله العظيم",
      "الحمد لله رب العالمين",
      "لا إله إلا الله وحده لا شريك له",
      "الله أكبر",
      "لا حول ولا قوة إلا بالله",
      "اللهم صل وسلم على نبينا محمد"
    ];
  } else if (category.startsWith("قرآن كريم")) {
    const verse = getQuranVerse();
    return verse ? [verse] : ["سبحان الله وبحمده"];
  } else {
    return config.get('messages'); // مخصص
  }
}

function showTasbeeh() {
  const messages = getMessages();

  if (messages && messages.length > 0) {
    const randomIndex = Math.floor(Math.random() * messages.length);
    const message = messages[randomIndex];
    // إضافة زر "تم الذكر" للتشجيع
    vscode.window.showInformationMessage(message, "تم الذكر 🤍").then(selection => {
      if (selection === "تم الذكر 🤍") {
        incrementDailyCount();
        outputChannel.appendLine('تم تأكيد الذكر، تقبل الله!');

        // تهنئة بسيطة عند الوصول للهدف
        const config = vscode.workspace.getConfiguration('tasbeeh');
        const goal = config.get('dailyGoal') || 100;
        if (getDailyCount() === goal) {
          vscode.window.showInformationMessage("🎉 ما شاء الله! لقد أكملت وردك اليومي من الأذكار. تقبل الله منك.");
        }
      }
    });
  }
}

async function showMenu() {
  const options = [
    { label: "$(heart) عرض ذكر الآن", description: "يظهر لك رسالة تنبيه فورية" },
    { label: "$(clock) إيقاف مؤقت (Snooze)", description: "تأجيل التنبيه القادم لمدة 15 دقيقة" },
    { label: "$(gear) تغيير المدة الزمنية", description: "يفتح إعدادات الإضافة لتغيير المدة" }
  ];

  const selection = await vscode.window.showQuickPick(options, { placeHolder: "قائمة ذكر الله - اختر الإجراء المطلوب" });

  if (selection) {
    if (selection.label.includes("عرض ذكر الآن")) {
      showTasbeeh();
    } else if (selection.label.includes("إيقاف مؤقت")) {
      setNextReminder(15);
      updateStatusBar();
      vscode.window.showInformationMessage("تم تأجيل التنبيه القادم لـ 15 دقيقة.");
    } else if (selection.label.includes("تغيير المدة الزمنية")) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'tasbeeh.interval');
    }
  }
}

function deactivate() {
  if (timerId) {
    clearInterval(timerId);
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

module.exports = {
  activate,
  deactivate
}
