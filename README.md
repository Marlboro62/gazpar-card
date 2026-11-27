<p>
  ☕ <strong>Si cette carte vous est utile, vous pouvez soutenir le projet :</strong>
</p>

<div style="white-space: nowrap; line-height: 0;">
  <a
    href="https://www.buymeacoffee.com/Marlboro62"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://img.buymeacoffee.com/button-api/?text=Offrir%20un%20caf%C3%A9&emoji=%E2%98%95&slug=Marlboro62&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
    alt="Offrir un café sur Buy Me a Coffee"
    height="45"
    style="display: block; border: 0;"
  ></a>&nbsp;&nbsp;<a
    href="https://ko-fi.com/M4M2QL45X"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
    alt="Soutenir le projet sur Ko-fi"
    height="45"
    style="display: block; border: 0;"
  ></a>
</div>

# Carte Gazpar

Carte Lovelace pour la consommation de **gaz lue en direct** par un capteur branché sur le compteur **Gazpar** : LiXee **ZiPulses** (Zigbee), compteur d'impulsions **ESPHome**, ou tout autre compteur de gaz cumulé dans Home Assistant.

Même présentation que la [Carte ZLinky](https://github.com/Marlboro62/ZLinky-Card) et la [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new), sans GRDF : tout vient des statistiques de Home Assistant, donc sans les un à trois jours de retard des relevés GRDF.

**🎮 [Essayer la démo en ligne](https://marlboro62.github.io/gazpar-card/docs/demo.html)** : la vraie carte avec des données inventées, sans Home Assistant ni compteur (compteur en m³ ou en kWh, impulsions brutes, thème clair ou sombre).

## Ce que la carte affiche

- **Aujourd'hui, en direct** : consommation depuis minuit en kWh et en m³, coût, écart avec hier à la même heure.
- **Gaz en cours** : une pastille s'allume quand le compteur a bougé dans les dernières minutes, avec l'heure de la dernière impulsion.
- **Heure par heure** du jour affiché.
- **Jours précédents** : les flèches ‹ › (ou un clic sur une barre du graphique) affichent un autre jour ; « Aujourd'hui » revient au jour en cours.
- **Détail du jour**, comme le tableau Énergie : gaz (énergie, volume, coût), abonnement, total.
- **Compteur** : index en m³ et en kWh, débit (facultatif), coefficient de conversion, prix du kWh et du m³.
- **Semaine, mois et année** jusqu'à hier, avec la projection du mois en cours et la comparaison avec l'an dernier (seulement si les statistiques couvrent presque toute la période).
- **Graphique** des 7, 14 ou 31 derniers jours.
- **Sections rabattables** : Compteur, Semaine, mois et année, et Historique se replient d'un clic, avec un résumé sur la ligne du titre.

## Installation

### Avec HACS

La carte fait partie du catalogue par défaut de HACS.

[![Ouvrir dans HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Marlboro62&repository=gazpar-card&category=plugin)

1. Ouvrez **HACS** et cherchez **Carte Gazpar** (ou cliquez sur le bouton ci-dessus).
2. Installez-la, puis rechargez la page (**Ctrl+F5**).
3. Ajoutez la carte **Carte Gazpar** à un tableau de bord : l'éditeur propose le compteur de gaz qu'il trouve.

Si la carte n'apparaît pas encore dans la recherche, ajoutez-la comme dépôt personnalisé : menu ⋮ › **Dépôts personnalisés**, adresse `https://github.com/Marlboro62/gazpar-card`, catégorie **Tableau de bord** (Lovelace).

### Manuellement

1. Copiez `gazpar-card.js` dans `/config/www/`.
2. **Paramètres › Tableaux de bord › Ressources** : ajoutez `/local/gazpar-card.js`, type **Module JavaScript**.
3. Rechargez la page (**Ctrl+F5**).

## Configuration

Le plus simple est l'**éditeur visuel**. En YAML :

```yaml
type: custom:gazpar-card
entity: sensor.compteur_de_gaz_volume            # compteur cumulé en m³ (ou en kWh)
conversion_entity: input_number.conversion_gaz   # coefficient kWh/m³ (ou conversion_factor: 11.2)
price_entity: input_number.prix_kwh_gaz          # prix du kWh (ou price: 0.105)
subscription_price: 19.50                        # abonnement mensuel TTC (facultatif)
```

| Option | Rôle | Par défaut |
| --- | --- | --- |
| `entity` | Compteur de gaz **cumulé** : m³ (ou L), kWh (ou Wh, MWh), ou impulsions sans unité. Il doit avoir la classe d'état `total_increasing` | — |
| `meter` | Nature du compteur : `auto` (d'après son unité), `m3`, `kwh` ou `pulses` (impulsions). À forcer sur `pulses` pour un **ZiPulses réglé par défaut**, qui compte des impulsions tout en affichant « kWh » | `auto` |
| `conversion_factor` | Coefficient de conversion en **kWh par m³** (sur la facture, environ 11). Une valeur hors de 5 à 15 est ignorée et signalée (par exemple un coefficient en kWh par impulsion, environ 0,11) | — |
| `conversion_entity` | …ou entité qui le donne : `input_number`, ou `sensor.gazpar` de l'intégration [home-assistant-gazpar](https://github.com/ssenart/home-assistant-gazpar) pour reprendre automatiquement le coefficient du dernier relevé GRDF | — |
| `unit` | Unité affichée : `auto` (kWh si le coefficient est connu, sinon m³), `kwh` ou `m3` | `auto` |
| `pulse_volume` | Volume d'une impulsion, pour un compteur en impulsions (Gazpar : 10 litres) | `0.01` |
| `index_offset` | Index de départ en m³, ajouté à l'**index affiché** pour qu'il corresponde à celui du Gazpar (le ZiPulses compte depuis 0 à son appairage). Sans effet sur les consommations | — |
| `price` | Prix du kWh de gaz TTC, en €/kWh : passe avant les deux suivants | — |
| `price_entity` | …ou entité du prix (`input_number` en €/kWh, ou en €/m³ si son unité le dit) | — |
| `energy_prices` | Sinon, prendre le prix du gaz réglé dans le **tableau Énergie** | `true` |
| `subscription_price` | Abonnement mensuel TTC, ajouté au coût au prorata des jours | — |
| `flow_entity` | Débit de gaz (facultatif) | — |
| `live_minutes` | « Gaz en cours » si le compteur a bougé depuis moins de … minutes | `5` |
| `days` | Jours affichés dans le graphique : 7, 14 ou 31 | `14` |
| `show_cost`, `show_details`, `show_scale` | Coûts, détail du jour, échelle des graphiques | `true` |
| `show_live`, `show_totals`, `show_chart` | Afficher les sections « Compteur », « Semaine, mois et année », « Historique » | `true` |
| `live_open`, `totals_open`, `chart_open` | Sections ouvertes au départ (un clic sur leur titre les rabat, choix retenu par le navigateur) | `true` |
| `show_week`, `tiles_horizontal` | Cases de la semaine en cours et de la semaine dernière ; disposition en 3 colonnes | `false` |
| `gas_color` | Couleur des barres (roue de couleurs dans l'éditeur) | orange |
| `theme` | `v2` (bleu nuit), `auto` (clair si Home Assistant est en clair), `ha` (thème de Home Assistant) | `v2` |
| `font_size` | Taille du texte en % | `100` |

## Exemple : LiXee ZiPulses

Le [ZiPulses](https://github.com/fairecasoimeme/ZiPulses) compte les **impulsions** du Gazpar : une impulsion = **10 litres** = 0,01 m³. Le plus fiable est un compteur en **m³**, la carte faisant elle-même la conversion en kWh.

### Solution conseillée : le ZiPulses envoie directement des m³

Le ZiPulses calcule lui-même un index converti (impulsions × multiplicateur ÷ diviseur) dans l'unité de votre choix. Réglez-le une fois :

| Réglage (cluster Metering) | Valeur pour un Gazpar |
| --- | --- |
| Unité (`unitOfMeasure`) | `1` (m³) |
| Multiplicateur (`multiplier`) | `1` |
| Diviseur (`divisor`) | `100` |

- **Zigbee2MQTT** : onglet **Exposes** du ZiPulses, saisissez les trois valeurs, puis appuyez sur le bouton **Link** du module (il dort et n'accepte les réglages qu'à son réveil). Vérifiez après actualisation, puis, dans l'onglet **À propos**, lancez la reconfiguration (icône jaune) et appuyez encore sur **Link**.
- **ZHA** : appareil › **Gérer l'appareil Zigbee** › cluster **Metering**, écrivez `unit_of_measure`, `multiplier` et `divisor`, en appuyant sur **Link** juste avant.

Choisissez ensuite dans la carte l'entité de comptage du ZiPulses. **Vérifiez son unité** dans **Outils de développement › États** : selon l'intégration, Home Assistant peut garder l'étiquette « kWh » alors que la valeur est désormais en m³. Dans ce cas, utilisez le capteur template ci-dessous (avec l'index converti, sans diviser par 100), pour que la carte et le tableau Énergie sachent qu'il s'agit de m³.

### Sans rien changer : le ZiPulses réglé par défaut

Laissé par défaut, le ZiPulses compte des **impulsions** mais son entité affiche « kWh » : cette étiquette est fausse. La carte peut lire ces impulsions directement, sans capteur template :

```yaml
type: custom:gazpar-card
entity: sensor.lixee_zipulses_consommation
meter: pulses              # impulsions, malgré l'unité « kWh » affichée
pulse_volume: 0.01         # une impulsion du Gazpar = 10 litres
index_offset: 8412.37      # index du Gazpar le jour de l'appairage (facultatif)
conversion_factor: 11.2    # kWh par m³, sur la facture
```

Sans `meter: pulses`, la carte prendrait chaque impulsion pour 1 kWh : elle affiche alors un avertissement. Pour le **tableau Énergie**, en revanche, il faut un capteur en m³ (ci-dessous), car il se fie à l'unité de l'entité.

### Sinon : un capteur template en m³

Garder le ZiPulses par défaut et passer par un capteur template protège aussi l'historique : si vous remplacez un jour le module, seul le template change.

Si l'index reste en impulsions, convertissez-le en m³ :

```yaml
template:
  - sensor:
      - name: "Compteur de gaz volume"
        unit_of_measurement: "m³"
        device_class: gas
        state_class: total_increasing
        state: "{{ states('sensor.lixee_zipulses_consommation') | float(0) / 100 }}"
        availability: "{{ states('sensor.lixee_zipulses_consommation') not in ['none', 'unknown', 'unavailable'] }}"
```

> ⚠️ **Évitez un compteur en kWh calculé avec un coefficient réglable** (`impulsions / 100 × coefficient`). Le coefficient de conversion change d'une facture à l'autre : à chaque modification, tout le cumul est recalculé. S'il baisse, le compteur `total_increasing` diminue, Home Assistant y voit une remise à zéro et le tableau Énergie affiche un pic. Avec un compteur en m³, le coefficient ne sert qu'à l'affichage.
>
> Attention aussi à l'unité : un nombre d'impulsions multiplié directement par un coefficient en kWh/m³ donne une énergie **100 fois trop grande** (il faut d'abord diviser par 100 pour avoir des m³).

### Bon à savoir sur le ZiPulses

- **Rythme des envois** : sur pile, le ZiPulses envoie son index **chaque minute pendant que le gaz passe** à partir du firmware v8 ; avant, seulement **toutes les 2 heures**, et le « direct » de la carte est alors très grossier. Alimenté sur secteur, il envoie l'index en moins d'une seconde.
- **Index qui recule** : avant le firmware **v12.2**, l'index pouvait reculer de 1 à 3 impulsions pendant un passage de gaz (Zigbee2MQTT). Home Assistant y voit une remise à zéro du compteur, d'où des pics dans les statistiques, la carte et le tableau Énergie. Mettez le firmware à jour (flash par USB-TTL, pas de mise à jour à distance).
- **Pas de débit** : le ZiPulses ne mesure pas le débit, l'option `flow_entity` ne lui sert pas. La pastille « Gaz en cours » se fonde sur les changements de l'index.

## Bon à savoir

- Le compteur doit avoir des **statistiques à long terme** (classe d'état `total_increasing`) : la carte lit les totaux par jour et par heure enregistrés par Home Assistant. Sans elles, elle le signale.
- L'historique commence à la mise en service du capteur dans Home Assistant.
- Le **coefficient de conversion** (pouvoir calorifique du gaz) est donné par GRDF et figure sur la facture. Il varie un peu selon les mois et la région.
- Le coût est une **estimation** : prix du kWh × énergie, plus l'abonnement si vous l'indiquez.

## Licence

MIT, © 2026 Marlboro62.
