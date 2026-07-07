import { CalendarOutlined, ClockCircleOutlined, CompassOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

type MeridianPeriod = {
  branch: string;
  range: string;
  meridian: string;
  organ: string;
  advice: string;
  avoid: string;
};

type SolarTerm = {
  name: string;
  date: string;
  theme: string;
  suitable: string;
  avoid: string;
  tips: [string, string];
};

const MERIDIAN_PERIODS: MeridianPeriod[] = [
  { branch: '子时', range: '23:00-01:00', meridian: '胆经', organ: '胆', advice: '宜安静入睡，让阳气潜藏。', avoid: '少熬夜、少重油夜宵。' },
  { branch: '丑时', range: '01:00-03:00', meridian: '肝经', organ: '肝', advice: '宜深睡养肝，减少情绪消耗。', avoid: '避免饮酒和长时间刷屏。' },
  { branch: '寅时', range: '03:00-05:00', meridian: '肺经', organ: '肺', advice: '宜保暖护肺，醒来先缓慢呼吸。', avoid: '避免清晨受寒、剧烈起身。' },
  { branch: '卯时', range: '05:00-07:00', meridian: '大肠经', organ: '大肠', advice: '宜饮温水、轻柔活动，帮助排便。', avoid: '少空腹冷饮。' },
  { branch: '辰时', range: '07:00-09:00', meridian: '胃经', organ: '胃', advice: '宜吃温和早餐，补充一天气血。', avoid: '避免久空腹和过甜早餐。' },
  { branch: '巳时', range: '09:00-11:00', meridian: '脾经', organ: '脾', advice: '宜专注工作，少量饮水，护脾运化。', avoid: '少久坐不动、少湿冷食物。' },
  { branch: '午时', range: '11:00-13:00', meridian: '心经', organ: '心', advice: '宜午间小憩，保持心神安定。', avoid: '避免暴晒和情绪激动。' },
  { branch: '未时', range: '13:00-15:00', meridian: '小肠经', organ: '小肠', advice: '宜清淡午后饮食，帮助吸收分清。', avoid: '少浓茶咖啡叠加。' },
  { branch: '申时', range: '15:00-17:00', meridian: '膀胱经', organ: '膀胱', advice: '宜伸展背部、补水，促进代谢。', avoid: '避免憋尿和久坐。' },
  { branch: '酉时', range: '17:00-19:00', meridian: '肾经', organ: '肾', advice: '宜放慢节奏，温和晚餐。', avoid: '少过度运动和高盐饮食。' },
  { branch: '戌时', range: '19:00-21:00', meridian: '心包经', organ: '心包', advice: '宜舒缓情绪，散步或热水泡脚。', avoid: '减少争执和高强度工作。' },
  { branch: '亥时', range: '21:00-23:00', meridian: '三焦经', organ: '三焦', advice: '宜准备入睡，调畅身心气机。', avoid: '避免宵夜和强光刺激。' },
];

const SOLAR_TERMS: SolarTerm[] = [
  { name: '小寒', date: '01-05', theme: '温补 防寒', suitable: '温阳护背', avoid: '久坐受寒', tips: ['姜枣茶暖中散寒', '睡前泡脚，腰背保暖'] },
  { name: '大寒', date: '01-20', theme: '藏阳 固本', suitable: '早睡护阳', avoid: '大汗伤阳', tips: ['粥汤温润养胃', '运动以微汗为度'] },
  { name: '立春', date: '02-04', theme: '疏肝 生发', suitable: '舒展筋骨', avoid: '情绪郁结', tips: ['多做伸展和散步', '饮食少酸多甘'] },
  { name: '雨水', date: '02-19', theme: '健脾 祛湿', suitable: '护脾暖胃', avoid: '湿冷生食', tips: ['山药薏米粥健脾', '雨天注意脚踝保暖'] },
  { name: '惊蛰', date: '03-05', theme: '醒阳 护肝', suitable: '早起活动', avoid: '熬夜动怒', tips: ['清淡饮食减油腻', '晨间散步助阳气'] },
  { name: '春分', date: '03-20', theme: '平衡 舒肝', suitable: '调作息', avoid: '忽冷忽热', tips: ['衣物随温差增减', '保持情绪舒展'] },
  { name: '清明', date: '04-04', theme: '清阳 宣肺', suitable: '踏青舒气', avoid: '过敏受风', tips: ['外出留意花粉刺激', '饮食清润少辛辣'] },
  { name: '谷雨', date: '04-20', theme: '祛湿 护脾', suitable: '健脾利湿', avoid: '贪凉困脾', tips: ['赤小豆冬瓜汤祛湿', '午后困倦先起身活动'] },
  { name: '立夏', date: '05-05', theme: '养心 清热', suitable: '午间小憩', avoid: '暴食冷饮', tips: ['莲子百合汤养心', '出汗后及时补水'] },
  { name: '小满', date: '05-21', theme: '清湿 防热', suitable: '清淡祛湿', avoid: '厚味助湿', tips: ['苦瓜绿豆汤清热', '衣物保持干爽'] },
  { name: '芒种', date: '06-05', theme: '化湿 安神', suitable: '规律睡眠', avoid: '湿热困身', tips: ['晚间少屏幕刺激', '饮食少甜腻'] },
  { name: '夏至', date: '06-21', theme: '护心 养阳', suitable: '午休养心', avoid: '烈日久晒', tips: ['绿豆百合汤清心', '中午避免剧烈运动'] },
  { name: '小暑', date: '07-07', theme: '消暑 清热', suitable: '通风避暑', avoid: '午间出行', tips: ['冬瓜荷叶茶消暑', '苦瓜菊花汤清热'] },
  { name: '大暑', date: '07-22', theme: '防暑 益气', suitable: '补水养气', avoid: '冷饮过量', tips: ['乌梅汤生津止渴', '运动避开高温时段'] },
  { name: '立秋', date: '08-07', theme: '润燥 收敛', suitable: '润肺养阴', avoid: '辛辣伤津', tips: ['银耳梨汤润肺', '早晚温差注意添衣'] },
  { name: '处暑', date: '08-23', theme: '清余热 润肺', suitable: '早睡早起', avoid: '秋燥上火', tips: ['百合莲子粥安神', '少熬夜，护津液'] },
  { name: '白露', date: '09-07', theme: '润燥 护肺', suitable: '温润饮食', avoid: '露脚受凉', tips: ['梨藕汤润燥', '夜间注意腹部保暖'] },
  { name: '秋分', date: '09-23', theme: '阴阳 平衡', suitable: '平和作息', avoid: '过劳耗气', tips: ['饮食温润不过补', '午后散步舒缓身心'] },
  { name: '寒露', date: '10-08', theme: '养阴 防寒', suitable: '护足暖胃', avoid: '晨露受寒', tips: ['芝麻核桃润燥', '外出加护颈肩'] },
  { name: '霜降', date: '10-23', theme: '温补 固表', suitable: '暖胃护阳', avoid: '过食生冷', tips: ['山药羊肉汤温补', '运动前充分热身'] },
  { name: '立冬', date: '11-07', theme: '收藏 养肾', suitable: '早睡养藏', avoid: '大汗耗阳', tips: ['黑豆核桃粥养肾', '晚间减少过度劳心'] },
  { name: '小雪', date: '11-22', theme: '温肾 防郁', suitable: '晒背暖阳', avoid: '久居阴冷', tips: ['萝卜羊肉汤暖身', '白天多接触自然光'] },
  { name: '大雪', date: '12-07', theme: '温阳 养藏', suitable: '护腰护膝', avoid: '寒风直吹', tips: ['桂圆红枣茶暖心', '出门注意头颈保暖'] },
  { name: '冬至', date: '12-21', theme: '扶阳 固肾', suitable: '温补养藏', avoid: '熬夜伤阳', tips: ['饺子汤羹暖中', '早睡，减少夜间消耗'] },
];

const BEIJING_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function TimeWellnessCard() {
  const [now, setNow] = useState(() => new Date());
  const beijingTime = useMemo(() => getBeijingTimeParts(now), [now]);
  const period = getMeridianPeriod(beijingTime.hour);
  const { current, next } = getSolarTerm(beijingTime.month, beijingTime.day);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="time-wellness-card" aria-label="time wellness overview">
      <div className="time-wellness-grid">
        <section className="time-wellness-main">
          <div className="time-wellness-kicker">
            <ClockCircleOutlined />
            <span>北京时间</span>
          </div>
          <div className="time-wellness-clock">{beijingTime.timeText}</div>
          <Typography.Text className="time-wellness-date">{beijingTime.dateText}</Typography.Text>
          <div className="time-wellness-period">
            <Tag color="geekblue">{period.branch}</Tag>
            <span>{period.range}</span>
          </div>
        </section>

        <section className="time-wellness-meridian">
          <div className="time-wellness-section-title">
            <CompassOutlined />
            <span>十二时辰经络</span>
          </div>
          <Typography.Title level={3}>{period.meridian}当令</Typography.Title>
          <Typography.Text className="time-wellness-muted">当前最旺经络：{period.organ} · {period.meridian}</Typography.Text>
          <div className="time-wellness-note-grid">
            <div>
              <span>宜</span>
              <p>{period.advice}</p>
            </div>
            <div>
              <span>忌</span>
              <p>{period.avoid}</p>
            </div>
          </div>
        </section>

        <section className="time-wellness-season">
          <div className="time-wellness-section-title">
            <CalendarOutlined />
            <span>节气提醒</span>
          </div>
          <div className="time-wellness-season-head">
            <Typography.Title level={3}>{current.name}</Typography.Title>
            <Typography.Text>{current.theme}</Typography.Text>
          </div>
          <div className="time-wellness-season-tags">
            <span className="season-tag suitable">宜 {current.suitable}</span>
            <span className="season-tag avoid">忌 {current.avoid}</span>
          </div>
          <Typography.Paragraph className="time-wellness-season-tips">
            {current.tips[0]}　{current.tips[1]}
          </Typography.Paragraph>
          <Typography.Text className="time-wellness-next">下一节气：{next.name} · {next.date}</Typography.Text>
        </section>
      </div>
    </section>
  );
}

function getBeijingTimeParts(date: Date) {
  const parts = Object.fromEntries(BEIJING_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute,
    timeText: `${padTime(hour)}:${padTime(minute)}`,
    dateText: `${parts.year}年${parts.month}月${parts.day}日 ${parts.weekday}`,
  };
}

function getMeridianPeriod(hour: number) {
  const index = hour === 23 ? 0 : Math.floor((hour + 1) / 2);
  return MERIDIAN_PERIODS[index] ?? MERIDIAN_PERIODS[0];
}

function getSolarTerm(month: number, day: number) {
  const key = month * 100 + day;
  const index = SOLAR_TERMS.findIndex((term, termIndex) => {
    const current = termKey(term.date);
    const next = SOLAR_TERMS[termIndex + 1] ? termKey(SOLAR_TERMS[termIndex + 1].date) : Infinity;
    return key >= current && key < next;
  });
  const safeIndex = index === -1 ? SOLAR_TERMS.length - 1 : index;
  return {
    current: SOLAR_TERMS[safeIndex],
    next: SOLAR_TERMS[(safeIndex + 1) % SOLAR_TERMS.length],
  };
}

function termKey(date: string) {
  const [month, day] = date.split('-').map(Number);
  return month * 100 + day;
}

function padTime(value: number) {
  return String(value).padStart(2, '0');
}
