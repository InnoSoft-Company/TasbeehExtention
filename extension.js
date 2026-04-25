const vscode = require('vscode');

let intervalId;
let outputChannel;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Tasbeeh Reminder");
    outputChannel.appendLine('Tasbeeh Reminder is now active!');
    
    // إظهار رسالة عند البدء للتأكد أن الإضافة تعمل
    vscode.window.showInformationMessage('تم تفعيل إضافة "ذكر الله" بنجاح. ستبدأ التنبيهات بالظهور حسب المدة المحددة.');

    // أمر لعرض تسبيح يدوياً في أي وقت
    let disposable = vscode.commands.registerCommand('tasbeeh.showNow', function () {
        showTasbeeh();
    });

    context.subscriptions.push(disposable);

    // تشغيل العداد عند تفعيل الإضافة
    startTimer();

    // تحديث العداد عند تغيير الإعدادات من قبل المستخدم
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('tasbeeh.interval')) {
            outputChannel.appendLine('تم تغيير إعدادات المدة الزمنية، إعادة تشغيل العداد...');
            startTimer();
        }
    });
}

function startTimer() {
    // إيقاف العداد القديم إذا كان يعمل
    if (intervalId) {
        clearInterval(intervalId);
    }

    // جلب الإعدادات الخاصة بالإضافة
    const config = vscode.workspace.getConfiguration('tasbeeh');
    let intervalMinutes = config.get('interval');

    outputChannel.appendLine(`جاري ضبط المنبه كل ${intervalMinutes} دقيقة.`);

    // إذا كانت المدة 0 أو أقل، نوقف الإضافة (لا نعرض شيء)
    if (intervalMinutes <= 0) {
        return;
    }

    // تحويل الدقائق إلى ملي ثانية
    const intervalMs = intervalMinutes * 60 * 1000;

    // تشغيل العداد الجديد
    intervalId = setInterval(() => {
        showTasbeeh();
    }, intervalMs);
}

function showTasbeeh() {
    const config = vscode.workspace.getConfiguration('tasbeeh');
    const messages = config.get('messages');
    
    if (messages && messages.length > 0) {
        // اختيار رسالة عشوائية من القائمة
        const randomIndex = Math.floor(Math.random() * messages.length);
        const message = messages[randomIndex];
        
        // عرض الرسالة للمستخدم
        vscode.window.showInformationMessage(message);
    }
}

// دالة يتم استدعاؤها عند تعطيل الإضافة
function deactivate() {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

module.exports = {
    activate,
    deactivate
}
