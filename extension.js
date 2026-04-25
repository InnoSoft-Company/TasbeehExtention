const vscode = require('vscode');

let statusBarItem;
let nextReminderTime;
let timerId;
let outputChannel;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Tasbeeh Reminder");
    outputChannel.appendLine('Tasbeeh Reminder v2 is now active!');

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
    
    statusBarItem.text = `📿 ${displayText}`;
    statusBarItem.tooltip = "ذكر الله - اضغط هنا للخيارات";
}

function showTasbeeh() {
    const config = vscode.workspace.getConfiguration('tasbeeh');
    const messages = config.get('messages');
    
    if (messages && messages.length > 0) {
        const randomIndex = Math.floor(Math.random() * messages.length);
        const message = messages[randomIndex];
        // إضافة زر "تم الذكر" للتشجيع
        vscode.window.showInformationMessage(message, "تم الذكر 🤍").then(selection => {
            if (selection === "تم الذكر 🤍") {
                outputChannel.appendLine('تم تأكيد الذكر، تقبل الله!');
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
