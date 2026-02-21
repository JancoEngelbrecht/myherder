import { createI18n } from 'vue-i18n'
import en from './en.json'
import af from './af.json'

const savedLocale = localStorage.getItem('locale') || 'en'

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en, af },
})

export default i18n
