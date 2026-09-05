# Ryzyko i zakres

Plan: lokalny Stripe Managed Payments, kryterium potwierdzona płatność → właściwe
premium oraz czwarta rozmowa po wyczerpaniu trzech bezpłatnych.

Wzorzec: `../e2e/seed.spec.ts`. Reguły: `../e2e/README.md` i skill `10x-e2e`.

Użytkownik z trzema zakończonymi rozmowami otwiera zakup z dashboardu. Odrzucona
karta nie daje premium. Udana płatność w tej samej sesji Checkout przyznaje premium
przez prawdziwy podpisany webhook, pozwala rozpocząć czwartą rozmowę na 3600 sekund
i zachowuje uprawnienie po ponownym uwierzytelnieniu oraz odświeżeniu strony.

Granice rzeczywiste: lokalny Supabase Auth i PostgreSQL, cookies SSR, Worker,
hostowany Checkout sandbox, Stripe CLI i webhook, API startu rozmowy oraz OpenRouter.
Brak mocków. SQL służy wyłącznie przygotowaniu trzech zużytych bezpłatnych miejsc,
powiązaniu testowego klienta, odczytom kontrolnym i usunięciu własnego konta testowego.

Kontrola regresji: bez webhooka asercja aktywnego premium musi zawieść; przy błędnym
czasie 900 sekund asercja czwartej rozmowy musi zawieść. Nie zmieniać asercji, aby
ominąć zmianę zachowania. Osobno odnotować wykonanie próby celowego zepsucia.
