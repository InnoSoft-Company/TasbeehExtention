const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let statusBarItem;
let nextReminderTime;
let timerId;
let outputChannel;
let extensionContext;
let quranCache = null;
let isNotificationVisible = false;

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
  context.subscriptions.push(vscode.commands.registerCommand('tasbeeh.readQuran', showQuranBrowser));

  // إظهار رسالة عند البدء
  vscode.window.showInformationMessage('تم تفعيل إضافة "ذكر الله". انظر أسفل يمين الشاشة لرؤية العداد 📿.');

  // بدء العداد
  startTimer();

  // تحديث العداد عند تغيير الإعدادات
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('tasbeeh')) {
      outputChannel.appendLine('تم تحديث الإعدادات.');
      startTimer();
      updateStatusBar();
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
    const interval = config.get('interval');
    if (interval <= 0) {
      statusBarItem.hide();
      return;
    }
    setNextReminder(interval);
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
  // استخدام التاريخ المحلي بدلاً من UTC لتجنب مشاكل التوقيت
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return extensionContext.globalState.get(`tasbeeh_count_${today}`, 0);
}

function incrementDailyCount() {
  if (!extensionContext) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const count = getDailyCount() + 1;
  extensionContext.globalState.update(`tasbeeh_count_${today}`, count);
  updateStatusBar();
}

function loadQuranCache() {
  if (quranCache) return quranCache;
  try {
    const quranDir = path.join(extensionContext.extensionPath, 'quran_json_files');
    const files = fs.readdirSync(quranDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
      });
    
    quranCache = files.map(file => {
      const filePath = path.join(quranDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        fileName: file,
        name: content.name,
        index: content.index,
        verseCount: Object.keys(content.verse).length,
        verses: content.verse
      };
    });
    return quranCache;
  } catch (err) {
    outputChannel.appendLine('Error caching Quran files: ' + err.message);
    return [];
  }
}

function getQuranVerse() {
  const cache = loadQuranCache();
  if (cache.length === 0) return null;

  // اختيار آية عشوائية بطريقة عادلة (Fair Randomization)
  // أولاً نحسب إجمالي عدد الآيات
  const totalVerses = cache.reduce((sum, s) => sum + s.verseCount, 0);
  let randomIdx = Math.floor(Math.random() * totalVerses);

  // البحث عن السورة التي تحتوي على هذه الآية
  for (const surah of cache) {
    if (randomIdx < surah.verseCount) {
      const verseKeys = Object.keys(surah.verses);
      const verseKey = verseKeys[randomIdx];
      const verseText = surah.verses[verseKey];
      const verseNumber = verseKey.split('_')[1];
      return `"${verseText}" - سورة ${surah.name} (${verseNumber})`;
    }
    randomIdx -= surah.verseCount;
  }
  return null;
}

async function showQuranBrowser() {
  const cache = loadQuranCache();
  if (cache.length === 0) {
    vscode.window.showErrorMessage("عذراً، لم يتم العثور على ملفات القرآن الكريم.");
    return;
  }

  const surahOptions = cache.map(s => ({
    label: `$(book) سورة ${s.name}`,
    description: `عدد الآيات: ${s.verseCount}`,
    surah: s
  }));

  const selectedSurah = await vscode.window.showQuickPick(surahOptions, {
    placeHolder: "اختر السورة التي تريد القراءة منها",
    matchOnDescription: true
  });

  if (selectedSurah) {
    const s = selectedSurah.surah;
    const verseKeys = Object.keys(s.verses);
    const verseOptions = verseKeys.map(vk => ({
      label: `آية ${vk.split('_')[1]}`,
      detail: s.verses[vk],
      verseText: s.verses[vk],
      verseNumber: vk.split('_')[1]
    }));

    const selectedVerse = await vscode.window.showQuickPick(verseOptions, {
      placeHolder: `سورة ${s.name} - اختر آية لعرضها`,
      matchOnDetail: true
    });

    if (selectedVerse) {
      vscode.window.showInformationMessage(`"${selectedVerse.verseText}" - سورة ${s.name} (${selectedVerse.verseNumber})`, "تم القراءة 🤍").then(selection => {
        if (selection === "تم القراءة 🤍") {
          incrementDailyCount();
        }
      });
    }
  }
}

async function searchQuran() {
  const cache = loadQuranCache();
  if (cache.length === 0) {
    vscode.window.showErrorMessage("عذراً، لم يتم العثور على ملفات القرآن الكريم.");
    return;
  }

  const searchQuery = await vscode.window.showInputBox({
    placeHolder: "أدخل كلمة للبحث عنها في القرآن الكريم",
    prompt: "بحث في آيات القرآن الكريم"
  });

  if (!searchQuery || searchQuery.trim() === '') return;

  const results = [];
  for (const surah of cache) {
    for (const [key, verseText] of Object.entries(surah.verses)) {
      if (verseText.includes(searchQuery)) {
        const verseNum = key.split('_')[1];
        results.push({
          label: `سورة ${surah.name} - آية ${verseNum}`,
          detail: verseText,
          surahName: surah.name,
          verseNumber: verseNum,
          verseText: verseText
        });
      }
    }
  }

  if (results.length === 0) {
    vscode.window.showInformationMessage(`لم يتم العثور على نتائج لـ "${searchQuery}"`);
    return;
  }

  const selected = await vscode.window.showQuickPick(results, {
    placeHolder: `تم العثور على ${results.length} نتيجة. اختر آية لعرضها:`,
    matchOnDetail: true
  });

  if (selected) {
    vscode.window.showInformationMessage(`"${selected.verseText}" - سورة ${selected.surahName} (${selected.verseNumber})`, "تم القراءة 🤍").then(selection => {
      if (selection === "تم القراءة 🤍") {
        incrementDailyCount();
      }
    });
  }
}

async function exportStats() {
  if (!extensionContext) return;
  const keys = extensionContext.globalState.keys().filter(k => k.startsWith('tasbeeh_count_'));
  if (keys.length === 0) {
    vscode.window.showInformationMessage("لا توجد إحصائيات لتصديرها بعد.");
    return;
  }

  // ترتيب التواريخ تصاعدياً
  keys.sort();

  let csvContent = "\uFEFFالتاريخ,عدد الأذكار\n"; // \uFEFF for Excel UTF-8 BOM
  keys.forEach(k => {
    const date = k.replace('tasbeeh_count_', '');
    const count = extensionContext.globalState.get(k);
    csvContent += `${date},${count}\n`;
  });

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('tasbeeh_stats.csv'),
    filters: {
      'CSV Files': ['csv']
    }
  });

  if (uri) {
    try {
      fs.writeFileSync(uri.fsPath, csvContent, 'utf8');
      vscode.window.showInformationMessage("تم تصدير الإحصائيات بنجاح!");
    } catch (err) {
      vscode.window.showErrorMessage("حدث خطأ أثناء التصدير: " + err.message);
    }
  }
}

function getMessages() {
  const config = vscode.workspace.getConfiguration('tasbeeh');
  const category = config.get('category') || "عام (General)";

  // استخدام نصوص البحث كقيم ثابتة لتسهيل الصيانة
  const CATEGORIES = {
    FORGIVENESS: "استغفار",
    MORNING_EVENING: "صباح ومساء",
    GENERAL: "عام",
    QURAN: "قرآن كريم",
    CUSTOM: "مخصص"
  };

  if (category.includes(CATEGORIES.FORGIVENESS)) {
    return [
      "أستغفر الله العظيم وأتوب إليه",
      "اللهم اغفر لي وارحمني",
      "أستغفر الله الذي لا إله إلا هو الحي القيوم وأتوب إليه",
      "سبحانك اللهم وبحمدك أشهد أن لا إله إلا أنت أستغفرك وأتوب إليك"
    ];
  } else if (category.includes(CATEGORIES.MORNING_EVENING)) {
    return [
      "بسم الله الذي لا يضر مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم",
      "رضيت بالله رباً وبالإسلام ديناً وبمحمد صلى الله عليه وسلم نبياً",
      "حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم",
      "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور"
    ];
  } else if (category.includes(CATEGORIES.GENERAL)) {
    return [
      "سبحان الله وبحمده، سبحان الله العظيم",
      "الحمد لله رب العالمين",
      "لا إله إلا الله وحده لا شريك له",
      "الله أكبر",
      "لا حول ولا قوة إلا بالله",
      "اللهم صل وسلم على نبينا محمد"
    ];
  } else if (category.includes(CATEGORIES.QURAN)) {
    const verse = getQuranVerse();
    return verse ? [verse] : ["سبحان الله وبحمده"];
  } else {
    // الفئة المخصصة أو أي فئة أخرى غير معروفة
    const customMessages = config.get('messages') || [];
    if (customMessages.length > 0) {
      return customMessages;
    }
    // تراجع (Fallback) في حال كانت القائمة المخصصة فارغة
    return ["سبحان الله وبحمده"];
  }
}

function showTasbeeh() {
  // منع تراكم التنبيهات في حال عدم تفاعل المستخدم (Idle Detection)
  if (isNotificationVisible) return;
  
  const messages = getMessages();

  if (messages && messages.length > 0) {
    const randomIndex = Math.floor(Math.random() * messages.length);
    const message = messages[randomIndex];
    
    isNotificationVisible = true;
    
    // إضافة زر "تم الذكر" للتشجيع
    vscode.window.showInformationMessage(message, "تم الذكر 🤍").then(selection => {
      isNotificationVisible = false;
      
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
    { label: "$(book) تصفح القرآن الكريم", description: "اختر سورة وآية محددة لقراءتها" },
    { label: "$(search) البحث في القرآن", description: "ابحث عن كلمة أو نص في آيات القرآن" },
    { label: "$(graph) تصدير الإحصائيات", description: "تصدير سجل الأذكار اليومية كملف CSV" },
    { label: "$(clock) إيقاف مؤقت (Snooze)", description: "تأجيل التنبيه القادم لمدة 15 دقيقة" },
    { label: "$(gear) إعدادات الإضافة", description: "تغيير الفئة، الهدف اليومي، أو المدة" }
  ];

  const selection = await vscode.window.showQuickPick(options, { placeHolder: "قائمة ذكر الله - اختر الإجراء المطلوب" });

  if (selection) {
    if (selection.label.includes("عرض ذكر الآن")) {
      showTasbeeh();
    } else if (selection.label.includes("تصفح القرآن الكريم")) {
      showQuranBrowser();
    } else if (selection.label.includes("البحث في القرآن")) {
      searchQuran();
    } else if (selection.label.includes("تصدير الإحصائيات")) {
      exportStats();
    } else if (selection.label.includes("إيقاف مؤقت")) {
      setNextReminder(15);
      updateStatusBar();
      vscode.window.showInformationMessage("تم تأجيل التنبيه القادم لـ 15 دقيقة.");
    } else if (selection.label.includes("إعدادات الإضافة")) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'tasbeeh');
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
