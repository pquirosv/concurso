<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';

const questions = ref({
  name: '',
  mode: '',
  answer: 0,
  options: [],
});
const selected = ref(null);

const hasPhotos = ref(false);
const hasYearPhoto = ref(false);
const cities = ref([]);
const hasInitialized = ref(false);
const questionError = ref('');
const questionMode = ref(() => '/api/year');
const isRoundActive = ref(false);
const score = ref(0);
const questionsRemaining = ref(0);
const startButtonLabel = ref('Comienza concurso');
const isStartingRound = ref(false);
const isQuestionLoading = ref(false);
const isQuestionReady = computed(() => Boolean(questions.value.name) && questions.value.options.length > 0);
const showEmptyState = computed(() => hasInitialized.value && !hasPhotos.value);
const showQuestionError = computed(() => hasInitialized.value && hasPhotos.value && Boolean(questionError.value));
const showRoundSummary = computed(() => hasInitialized.value && hasPhotos.value && !isRoundActive.value);
const showMain = computed(() => isRoundActive.value && isQuestionReady.value && !showQuestionError.value);

// Generate a random integer in [0, maxExclusive) using Math.random.
const randomInt = (maxExclusive) => Math.floor(Math.random() * maxExclusive);

// Shuffle an array using Fisher-Yates and Math.random.
const shuffleCrypto = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Reset the current rendered question state and selected answer.
const resetQuestionState = () => {
  questions.value = {
    name: '',
    mode: '',
    answer: 0,
    options: [],
  };
  selected.value = null;
};

// Fetch dataset metadata once (photo count, year availability, cities list).
const initDatasetInfo = async () => {
  if (hasInitialized.value) return;
  try {
    const response = await axios.get('/api/photos/count');
    hasPhotos.value = Number(response.data?.count || 0) > 0;
    if (hasPhotos.value) {
      const yearResponse = await axios.get('/api/photos/hasYearPhoto');
      hasYearPhoto.value = yearResponse.data?.hasYearPhoto || false;
      const citiesResponse = await axios.get('/api/cities');
      cities.value = citiesResponse.data || [];
      setQuestionMode();
    }
    hasInitialized.value = true;
  } catch (error) {
    console.error(error);
    hasPhotos.value = false;
    hasInitialized.value = true;
  }
};

// Determine the question mode based on dataset characteristics.
const setQuestionMode = () => {
  if (hasYearPhoto.value && cities.value.length > 0) {
    questionMode.value = () => (randomInt(2) === 0 ? '/api/year' : '/api/city');
  } else if (!hasYearPhoto.value) {
    questionMode.value = () => '/api/city';
  } else {
    questionMode.value = () => '/api/year';
  }
};

// Build question state for year mode using the selected photo year and nearby candidates.
const setYearQuestion = (responseData) => {
  const currentYear = new Date().getFullYear();
  const minYear = responseData.year - 4;
  const maxYear = responseData.year + 4;
  const yearCandidates = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).filter(
    (year) => year !== responseData.year && year < currentYear
  );
  const candidates = shuffleCrypto(yearCandidates).slice(0, 3);

  questions.value.name = responseData.name;
  questions.value.mode = 'year';
  questions.value.answer = responseData.year;
  questions.value.options = shuffleCrypto([responseData.year, ...candidates]);
};

// Build question state for city mode using the selected photo city and random alternatives.
const setCityQuestion = (responseData) => {
  questions.value.name = responseData.name;
  questions.value.mode = 'city';
  questions.value.answer = responseData.city;
  const candidates = shuffleCrypto(cities.value.filter((city) => city && city !== responseData.city)).slice(0, 3);
  questions.value.options = shuffleCrypto([responseData.city, ...candidates]);
};

// Fetch a new question and populate the UI state.
const fetchQuestion = async () => {
  questionError.value = '';
  isQuestionLoading.value = true;
  try {
    const apiUrl = questionMode.value();
    const response = await axios.get(apiUrl);
    const responseData = response.data;

    if (apiUrl === '/api/year') {
      setYearQuestion(responseData);
    }
    else if (apiUrl === '/api/city') {
      setCityQuestion(responseData);
    }
  } catch (error) {
    console.error(error);
    questionError.value = 'No se pudo cargar una pregunta. Vuelve a intentarlo.';
  } finally {
    isQuestionLoading.value = false;
  }
};

// Start a new quiz round by loading fresh random pools and the first question.
const startRound = async () => {
  questionError.value = '';
  isStartingRound.value = true;
  startButtonLabel.value = 'Cargando...';
  resetQuestionState();
  try {
    const response = await axios.post('/api/quiz/start');
    const poolSize = Number(response.data?.poolSize || 0);
    questionsRemaining.value = poolSize;
    score.value = 0;
    isRoundActive.value = poolSize > 0;
    if (isRoundActive.value) {
      await fetchQuestion();
      startButtonLabel.value = 'Comenzar partida';
      return;
    }
    questionError.value = 'No hay preguntas disponibles para iniciar una partida.';
    startButtonLabel.value = 'Comenzar partida';
  } catch (error) {
    console.error(error);
    questionError.value = 'No se pudo iniciar la partida. Vuelve a intentarlo.';
    isRoundActive.value = false;
    startButtonLabel.value = 'Comenzar partida';
  } finally {
    isStartingRound.value = false;
  }
};

// Validate the selected answer, update score, and move to next question or summary.
const nextQuestion = async () => {
  if (selected.value === null) return;

  if (String(selected.value) === String(questions.value.answer)) {
    score.value += 1;
  }

  questionsRemaining.value = Math.max(0, questionsRemaining.value - 1);

  if (questionsRemaining.value === 0) {
    isRoundActive.value = false;
    resetQuestionState();
    return;
  }

  resetQuestionState();
  await fetchQuestion();
};

// Retry loading the current question when question fetch fails.
const retryQuestion = async () => {
  if (!isRoundActive.value) {
    await startRound();
    return;
  }
  await fetchQuestion();
};

// Initialize data once the component is mounted.
onMounted(async () => {
  await initDatasetInfo();
});
</script>

<template>
  <main class="app">
    <h1 class="title-quiz">Concurso</h1>
    <div v-if="showEmptyState" class="empty-state">
      <span class="empty-message">No hay fotos disponibles. Por favor, sube algunas fotos para comenzar el concurso.</span>
    </div>
    <div v-else-if="showQuestionError" class="empty-state">
      <span class="empty-message">{{ questionError }}</span>
      <div class="buttonContainer">
        <button class="slctButton" :disabled="isStartingRound || isQuestionLoading" @click="retryQuestion">Reintentar</button>
      </div>
    </div>
    <div v-else-if="showRoundSummary" class="empty-state">
      <span class="empty-message">PUNTUACIÓN: {{ score }}</span>
      <div class="buttonContainer">
        <button class="slctButton" :disabled="isStartingRound" @click="startRound">{{ startButtonLabel }}</button>
      </div>
    </div>
    <div v-else-if="showMain" class="mainElement">
      <div class="quiz">
        <div class="quiz-info">
          <span v-if="questions.mode === 'year'" class="question">¿De que año es esta foto?</span>
          <span v-else class="question">¿De que ciudad es esta foto?</span>
        </div>
        <div class="options">
          <label
            v-for="(option, index) in questions.options"
            :key="`${option}-${index}`"
            :for="'option' + index"
            :class="{
              option: true,
              correct: selected != null && String(option) === String(questions.answer),
              wrong: selected != null && String(option) !== String(questions.answer) && String(selected) === String(option),
              disabled: selected != null,
            }"
          >
            <input
              :id="'option' + index"
              v-model="selected"
              type="radio"
              name="question-options"
              :value="option"
              :disabled="selected !== null"
            />
            <span>{{ option }}</span>
          </label>
        </div>
        <div class="buttonContainer">
          <button class="slctButton" :disabled="selected === null || isQuestionLoading" @click="nextQuestion">
            {{ selected == null ? 'Selecciona una Opción' : 'Siguiente pregunta' }}
          </button>
        </div>
      </div>
      <div class="foto">
        <img
          :src="'/fotos/' + questions.name"
          :alt="`Foto de pregunta ${questions.mode === 'year' ? 'año' : 'ciudad'}`"
          loading="eager"
          fetchpriority="high"
          decoding="async"
        />
      </div>
    </div>
  </main>
</template>
