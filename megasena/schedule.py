"""
Proximo sorteio: numero e data.

Fonte preferida: a API da Caixa (dataProximoConcurso). Se ela falhar (por exemplo, no
build do Netlify), estima pelo calendario regular da Mega-Sena: terca, quinta e sabado.
Feriados e concursos especiais mudam a data, por isso a estimativa vem marcada.
"""
from datetime import date, datetime, timedelta

DRAW_WEEKDAYS = {1, 3, 5}  # terca, quinta, sabado (segunda = 0)


def estimate_next_draw(last_date, today=None):
    """Proxima terca/quinta/sabado depois do ultimo sorteio (e nao antes de hoje)."""
    d = max(date.fromisoformat(str(last_date)[:10]), (today or date.today()) - timedelta(days=1))
    d += timedelta(days=1)
    while d.weekday() not in DRAW_WEEKDAYS:
        d += timedelta(days=1)
    return d.isoformat()


def next_draw_info(last_number, last_date, api_status=None, today=None):
    """
    {number, date (AAAA-MM-DD), source: 'caixa' | 'estimado'}.
    api_status: o 'next_draw' gravado por update_dataset.py, se a API respondeu.
    """
    today = today or date.today()
    nd = (api_status or {}).get('next_draw') or {}
    try:
        api_date = datetime.strptime(nd.get('date', ''), '%d/%m/%Y').date()
        if int(nd.get('number')) == last_number + 1 and api_date >= today:
            return {"number": last_number + 1, "date": api_date.isoformat(), "source": "caixa"}
    except (TypeError, ValueError):
        pass
    return {"number": last_number + 1, "date": estimate_next_draw(last_date, today),
            "source": "estimado"}
