import type { Metadata } from 'next';
import { Afacad, Rozha_One, Tiro_Devanagari_Hindi, Yatra_One } from 'next/font/google';
import './globals.css';
import localFont from 'next/font/local';

import {
  WalletProvider,
  GameFeedProvider,
  ModalProvider,
  ToastProvider,
  TeamWinProvider,
  OnboardingProvider,
} from '@/lib/providers';
import { ChainActivity } from '@/components/chain/ChainActivity';
import { ModalRegistry } from '@/components/modals';
import { Toaster } from '@/components/ui/sonner';

const afacad = Afacad({
  variable: '--font-afacad',
  subsets: ['latin'],
});

const rozha = Rozha_One({
  variable: '--font-rozha',
  subsets: ['latin'],
  weight: ['400'],
});

const yatra = Yatra_One({
  variable: '--font-yatra',
  subsets: ['latin'],
  weight: ['400'],
});

const tiro = Tiro_Devanagari_Hindi({
  variable: '--font-tiro',
  subsets: ['devanagari', 'latin'],
  weight: ['400'],
});

const clashGrotesk = localFont({
  src: [
    {
      path: '../public/fonts/ClashGrotesk-Extralight.woff2',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../public/fonts/ClashGrotesk-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/ClashGrotesk-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/ClashGrotesk-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/ClashGrotesk-Semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../public/fonts/ClashGrotesk-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-clash',
});

export const metadata: Metadata = {
  title: 'Samrajya — साम्राज्य',
  description: 'A real-time, on-chain war for the empire on MagicBlock Ephemeral Rollups.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${clashGrotesk.variable} ${afacad.variable} ${rozha.variable} ${yatra.variable} ${tiro.variable} font-afacad`}
      >
        <WalletProvider>
          <GameFeedProvider>
            <ModalProvider>
              <TeamWinProvider>
                <ToastProvider>
                  <OnboardingProvider>
                    {children}
                    <ChainActivity />
                    <ModalRegistry />
                    <Toaster theme="dark" />
                  </OnboardingProvider>
                </ToastProvider>
              </TeamWinProvider>
            </ModalProvider>
          </GameFeedProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
