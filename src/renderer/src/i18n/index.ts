/**
 * 内嵌语言资源初始化：中文系统使用简中，其余回退英文，运行时无需联网加载翻译。
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh-CN.json'
import en from './en.json'
export function resolveLanguage(language: string, systemLocale = navigator.language): 'zh-CN' | 'en' {
  return (language === 'system' ? systemLocale : language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
// 资源已内嵌，使用同步初始化；React 自带文本转义，翻译层无需再把文本转义一次。
void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zh }, en: { translation: en } },
  lng: resolveLanguage('system'), fallbackLng: 'en', interpolation: { escapeValue: false }, initAsync: false,
})
export default i18n
