import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh-CN.json'
import en from './en.json'
export function resolveLanguage(language: string, systemLocale = navigator.language): 'zh-CN' | 'en' {
  return (language === 'system' ? systemLocale : language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zh }, en: { translation: en } },
  lng: resolveLanguage('system'), fallbackLng: 'en', interpolation: { escapeValue: false }, initAsync: false,
})
export default i18n
