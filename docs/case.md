1. uzytkownik wchodzi do aplikacji i widzi landing page, mam mozliwosc zlozenia konta, zalogowania sie oraz wykorzystania darmowej 15 minutowej sesji ( tylko jesli ma konto, najpierw musi sie zalogowac aby ta opcja byla dostepna ale informacja o tej mozliwosci jest widoczna dla kazdego na landing page)
2. User moze sie zalogowac i rozpoczac sesje z jednym z psychoterapeutow ( kazdy reprezentuje inna szkole, nurt psychoterapii) oraz obejrzec historie swojich sesji oraz rozpcozac nowa
3. kazda nowa rozmowa z wybranym specjalista ma w kontkescie informacje o wszystkcih poprzednich ( w postaci podsumowania najwaznijeszych faktow z poprzednich sesji), kazdy awatar zanim odpowie odczekuje jakis czas ( co ma symulowac myslenie psychoterapeuty)
4. aplikacja poczatkowo bedzie dostepna tylko w przegladarce ale pozniej planuje tez wersje mobilna
5. w kazdej sesji widoczny jest czas jej trwania ( jeszcze sie zastanawiam ale mysle ze limit trwania sesji jest wskazany) 
tak jestem w stanie to zrobic w 3 tygodnie po godzinach

przygotuj plan pierwszego wdrożenie w oparciu o context/foundation/infrastructure.md, zgodnie ze stackiem z context/foundation/tech-stack.md
Plan powinien zawierać:
- liste rzeczy ktora musi byc wykonana reczenie przed wdrozeniem planu
- kroki automatyczne, które będą wykonane przez agenta
- listę kont i serwisów, które trzeba skonfigurować ręcznie (konto Cloudflare, ewentualnie zewnętrzna baza),
- listę sekretów do skonfigurowania (zmienne środowiskowe, klucze API),
- konkretne komendy wdrożeniowe w formie dokumentacji 
Po zatwierdzeniu planu agent wykonuje te kroki, gdzie sam przypisał się jako "owner". Twoja rola może dotyczyć uzupełniania luk, konfiguracji sekretów czy weryfikacji stanu końcowego. Obserwuj, czy agent nie próbuje czegoś, czego nie ma w planie.
Zatwierdzony plan zostaje w repo jako context/deployment/deploy-plan.md. To nie jest "dokument na półkę" - w kolejnej lekcji, kiedy będziemy planować milestony implementacji samego MVP, agent dostanie ten plik jako kontekst, żeby wiedzieć, co już jest postawione, jakie sekrety są skonfigurowane i z jakich gotowych ścieżek deploy korzysta projekt.