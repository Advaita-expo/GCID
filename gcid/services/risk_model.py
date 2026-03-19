def calculate_ww3_risk(active_conflicts, nuclear_powers, oil_price, volatility):
    """
    Simple WW3 risk model per spec. Returns tuple: (score, level, contributors)
    """
    score = 0
    contributors = {}

    score += active_conflicts * 5
    contributors['active_conflicts'] = active_conflicts * 5

    score += nuclear_powers * 10
    contributors['nuclear_powers'] = nuclear_powers * 10

    if oil_price > 100:
        score += 20
        contributors['oil_price'] = 20
    else:
        contributors['oil_price'] = 0

    if volatility > 5:
        score += 15
        contributors['volatility'] = 15
    else:
        contributors['volatility'] = 0

    final = min(score, 100)

    if final < 30:
        level = 'Low'
    elif 30 <= final < 60:
        level = 'Medium'
    elif 60 <= final < 80:
        level = 'High'
    else:
        level = 'Critical'

    return final, level, contributors
