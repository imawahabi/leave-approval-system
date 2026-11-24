export function AppLoadingScreen() {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6" dir="rtl" role="status" aria-live="polite">
    <div className="relative mb-6">
      <div className="absolute inset-0 rounded-3xl bg-teal-200/40 blur-2xl animate-pulse" />
      <div className="relative w-24 h-24 rounded-xl bg-white p-3 shadow-sm flex items-center justify-center">
        <img src="/entity-logo.png" alt="شعار الجهة الحكومية" className="w-full h-full object-contain" />
      </div>
    </div>
    <h1 className="text-lg font-bold text-slate-900">نظام إدارة واعتماد الإجازات</h1>
    <p className="mt-1 text-sm text-slate-500">الجهة الحكومية</p>
    <div className="flex items-center gap-1.5 mt-6" aria-hidden="true">
      <span className="w-2 h-2 rounded-full bg-teal-700 motion-safe:animate-bounce" />
      <span className="w-2 h-2 rounded-full bg-teal-500 motion-safe:animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-teal-300 motion-safe:animate-bounce [animation-delay:300ms]" />
    </div>
    <span className="sr-only">جارٍ تحميل النظام والتحقق من الحساب</span>
  </div>;
}
