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

1. Ouvrez **HACS**, menu ⋮ › **Dépôts personnalisés**.
2. Adresse `https://github.com/Marlboro62/gazpar-card`, catégorie **Tableau de bord** (Lovelace).
3. Cherchez **Carte Gazpar**, installez-la, puis rechargez la page (**Ctrl+F5**).
4. Ajoutez la carte **Carte Gazpar** à un tableau de bord : l'éditeur propose le compteur de gaz qu'il trouve.

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
| `conversion_factor` | Coefficient de conversion en **kWh par m³** (sur la facture, environ 11) | — |
| `conversion_entity` | …ou entité qui le donne : `input_number`, ou `sensor.gazpar` de l'intégration [home-assistant-gazpar](https://github.com/ssenart/home-assistant-gazpar) pour reprendre automatiquement le coefficient du dernier relevé GRDF | — |
| `unit` | Unité affichée : `auto` (kWh si le coefficient est connu, sinon m³), `kwh` ou `m3` | `auto` |
| `pulse_volume` | Volume d'une impulsion, pour un compteur sans unité (Gazpar : 10 litres) | `0.01` |
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

Le ZiPulses compte les **impulsions** du Gazpar : une impulsion = **10 litres** = 0,01 m³. Le plus fiable est un capteur en **m³**, la carte faisant elle-même la conversion en kWh :

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

## Bon à savoir

- Le compteur doit avoir des **statistiques à long terme** (classe d'état `total_increasing`) : la carte lit les totaux par jour et par heure enregistrés par Home Assistant. Sans elles, elle le signale.
- L'historique commence à la mise en service du capteur dans Home Assistant.
- Le **coefficient de conversion** (pouvoir calorifique du gaz) est donné par GRDF et figure sur la facture. Il varie un peu selon les mois et la région.
- Le coût est une **estimation** : prix du kWh × énergie, plus l'abonnement si vous l'indiquez.

## Licence

MIT, © 2026 Marlboro62.
