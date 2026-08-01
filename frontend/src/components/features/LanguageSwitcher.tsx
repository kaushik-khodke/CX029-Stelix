import React from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
    { code: 'mr', name: 'मराठी', flag: '🇮🇳' },
  ]

  const changeLanguage = (lng: string) => {
    if (i18n && typeof i18n.changeLanguage === 'function') {
      i18n.changeLanguage(lng)
      localStorage.setItem('language', lng)
    }
  }

  const currentLanguage = i18n?.language || 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors w-full group-data-[collapsible=icon]:px-0">
          <Globe className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
            {languages.find(l => l.code === currentLanguage)?.flag || '🌐'} {currentLanguage.toUpperCase()}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-48 z-[100]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`cursor-pointer flex items-center gap-2 ${
              currentLanguage === lang.code ? 'bg-primary/10 font-semibold' : ''
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
